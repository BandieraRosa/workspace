// 图片链表节点类
class ImageNode {
    constructor(file, preview = null) {
        this.file = file;
        this.preview = preview;
        this.previewBlobUrl = null;
        this.next = null;
        this.prev = null;
    }
    cleanup() {
        if (this.previewBlobUrl) {
            URL.revokeObjectURL(this.previewBlobUrl);
            this.previewBlobUrl = null;
        }
    }
}

// 图片链表类
class ImageLinkedList {
    constructor() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }
    append(file, preview) {
        const node = new ImageNode(file, preview);
        if (!this.head) {
            this.head = this.tail = node;
        } else {
            this.tail.next = node;
            node.prev = this.tail;
            this.tail = node;
        }
        this.size++;
        return node;
    }
    clear() {
        let current = this.head;
        while (current) {
            current.cleanup();
            current = current.next;
        }
        this.head = this.tail = null;
        this.size = 0;
    }
}

// 应用主类
class ImageViewerApp {
    constructor() {
        this.imageList = new ImageLinkedList();
        this.debugMode = false;
        this.currentImageNode = null;
        // 缩放与拖拽状态
        this.currentScale = 1;
        this.minScale = 0.1;
        this.maxScale = 5;
        this.scaleStep = 0.1;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.imagePosition = { x: 0, y: 0 };
        
        // 缓存DOM元素
        this.dom = {
            folderInput: document.getElementById('folderInput'),
            previewContainer: document.getElementById('previewContainer'),
            mainImageContainer: document.getElementById('mainImageContainer'),
            loading: document.getElementById('loading'),
            debugContent: document.getElementById('debugContent'),
            debugBtn: document.getElementById('debugBtn')
        };
        
        this.init();
    }

    init() {
        document.getElementById('selectFolderBtn').addEventListener('click', () => this.dom.folderInput.click());
        this.dom.folderInput.addEventListener('change', this.handleFolderSelect);
        document.getElementById('startInferenceBtn').addEventListener('click', this.startInference);
        this.dom.debugBtn.addEventListener('click', this.toggleDebug);

        this.dom.mainImageContainer.addEventListener('wheel', this.handleImageZoom);
        this.dom.mainImageContainer.addEventListener('mousedown', this.handleDragStart);
        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('mouseup', this.handleDragEnd);
        this.dom.mainImageContainer.addEventListener('dblclick', this.resetImageTransform);

        this.log('应用初始化完成', 'info');
    }

    // 使用箭头函数自动绑定 this
    handleFolderSelect = async (event) => {
        const files = Array.from(event.target.files).filter(this.isImageFile);
        if (files.length === 0) {
            this.log('未找到有效的图片文件', 'warning');
            return;
        }

        this.log(`找到 ${files.length} 个图片文件`, 'info');
        this.imageList.clear();
        this.dom.previewContainer.innerHTML = '';
        
        for (const file of files) {
            try {
                const previewBlob = await this.generatePreviewBlob(file);
                const node = this.imageList.append(file, previewBlob);
                this.renderPreviewItem(node);
            } catch (error) {
                this.log(`处理文件 ${file.name} 时出错: ${error.message}`, 'error');
            }
        }
    }

    isImageFile = (file) => file.type.startsWith('image/');

    generatePreviewBlob = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxSize = 300;
                    let { width, height } = img;
                    if (width > height) {
                        if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                    } else {
                        if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', 0.8);
                };
                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }

    renderPreviewItem = (node) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        node.previewBlobUrl = URL.createObjectURL(node.preview);
        div.innerHTML = `
            <img src="${node.previewBlobUrl}" alt="${node.file.name}">
            <div class="preview-item-name">${this.escapeHtml(node.file.name)}</div>
        `;
        div.addEventListener('click', () => this.selectImage(node, div));
        this.dom.previewContainer.appendChild(div);
    }

    selectImage = (node, element) => {
        document.querySelector('.preview-item.active')?.classList.remove('active');
        element.classList.add('active');
        
        this.currentImageNode = node;
        this.displayMainImage(node.file);
        this.log(`已选择图片: ${node.file.name}`, 'info');
    }

    displayMainImage = (file) => {
        this.dom.loading.style.display = 'block';
        this.dom.mainImageContainer.innerHTML = '';
        this.resetImageTransform();

        const reader = new FileReader();
        reader.onload = e => {
            const img = document.createElement('img');
            img.className = 'main-image';
            img.src = e.target.result;
            img.onload = () => {
                this.dom.loading.style.display = 'none';
                this.dom.mainImageContainer.appendChild(img);
                const zoomInfo = document.createElement('div');
                zoomInfo.className = 'zoom-info';
                zoomInfo.id = 'zoomInfo';
                zoomInfo.textContent = '100%';
                this.dom.mainImageContainer.appendChild(zoomInfo);
            };
        };
        reader.readAsDataURL(file);
    }
    
    // 缩放与拖拽处理
    handleImageZoom = (event) => {
        if (!this.currentImageNode || !this.dom.mainImageContainer.querySelector('.main-image')) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -this.scaleStep : this.scaleStep;
        this.currentScale = Math.max(this.minScale, Math.min(this.maxScale, this.currentScale + delta));
        this.updateImageTransform();
        this.updateZoomInfo();
    }
    handleDragStart = (event) => {
        if (!this.currentImageNode || this.currentScale <= 1) return;
        this.isDragging = true;
        this.dragStart = { x: event.clientX, y: event.clientY };
        this.dom.mainImageContainer.classList.add('dragging');
        event.preventDefault();
    }
    handleDragMove = (event) => {
        if (!this.isDragging) return;
        this.imagePosition.x += event.clientX - this.dragStart.x;
        this.imagePosition.y += event.clientY - this.dragStart.y;
        this.dragStart = { x: event.clientX, y: event.clientY };
        this.updateImageTransform();
    }
    handleDragEnd = () => {
        if (this.isDragging) {
            this.isDragging = false;
            this.dom.mainImageContainer.classList.remove('dragging');
        }
    }
    updateImageTransform = () => {
        const img = this.dom.mainImageContainer.querySelector('.main-image');
        if (img) {
            img.style.transform = `scale(${this.currentScale}) translate(${this.imagePosition.x / this.currentScale}px, ${this.imagePosition.y / this.currentScale}px)`;
        }
    }
    updateZoomInfo = () => {
        const zoomInfo = document.getElementById('zoomInfo');
        if (zoomInfo) zoomInfo.textContent = `${Math.round(this.currentScale * 100)}%`;
    }
    resetImageTransform = () => {
        this.currentScale = 1;
        this.imagePosition = { x: 0, y: 0 };
        this.updateImageTransform();
        this.updateZoomInfo();
    }

    // 推理与调试
    startInference = () => {
        if (this.imageList.size === 0) {
            return this.log('请先选择图片文件夹', 'warning');
        }
        this.log('开始推理处理...', 'info');
        let current = this.imageList.head;
        const processNext = () => {
            if (!current) return this.log('推理处理完成', 'info');
            this.log(`处理中: ${current.file.name}`, 'info');
            setTimeout(() => {
                current = current.next;
                processNext();
            }, 500);
        };
        processNext();
    }

    toggleDebug = () => {
        this.debugMode = !this.debugMode;
        if (this.debugMode) {
            this.dom.debugBtn.textContent = 'Debug (ON)';
            this.dom.debugBtn.style.backgroundColor = '#dc3545';
            this.log('调试模式已开启', 'info');
            this.logDebug('Debug Mode Activated', {
                images: this.imageList.size,
                current: this.currentImageNode?.file.name ?? 'None'
            });
        } else {
            this.dom.debugBtn.textContent = 'Debug';
            this.dom.debugBtn.style.backgroundColor = '#6c757d';
            this.log('调试模式已关闭', 'info');
        }
    }

    _addLogEntry(innerHTML, className = '', maxEntries = 100) {
        const entry = document.createElement('div');
        entry.className = `debug-entry ${className}`;
        entry.innerHTML = innerHTML;
        this.dom.debugContent.appendChild(entry);
        if (this.debugMode || className.includes('error')) {
            this.dom.debugContent.scrollTop = this.dom.debugContent.scrollHeight;
        }
        while (this.dom.debugContent.children.length > maxEntries) {
            this.dom.debugContent.removeChild(this.dom.debugContent.firstChild);
        }
    }

    log = (message, type = 'info') => {
        const typeClass = type === 'error' ? 'debug-error' : (type === 'warning' ? 'debug-warning' : '');
        const html = `
            <div class="debug-time">[${new Date().toLocaleTimeString()}]</div>
            <div class="debug-message">${this.escapeHtml(message)}</div>`;
        this._addLogEntry(html, typeClass);
    }
    
    logDebug = (title, data) => {
        if (!this.debugMode) return;
        const dataStr = `<pre style="margin-top: 8px; font-size: 11px; white-space: pre-wrap; word-break: break-word;">${JSON.stringify(data, null, 2)}</pre>`;
        const html = `
            <div class="debug-time">[${new Date().toLocaleTimeString()}] DEBUG</div>
            <div class="debug-message" style="font-weight: bold; color: #17a2b8;">${this.escapeHtml(title)}</div>
            ${dataStr}`;
        this._addLogEntry(html, 'debug-info', 200);
    }

    escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    cleanup = () => this.imageList.clear();
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new ImageViewerApp(); });
window.addEventListener('beforeunload', () => app?.cleanup());
