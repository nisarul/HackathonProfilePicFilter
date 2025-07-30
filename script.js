class ProfilePictureCreator {
    constructor() {
        this.canvas = document.getElementById('previewCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.originalImage = null;
        this.currentFrame = null;
        this.currentBadge = null;
        this.currentBackground = null;
        this.badgeSize = 80;
        this.badgePosition = 'top-left';
        this.badgeX = 20; // Custom X position (percentage)
        this.badgeY = 20; // Custom Y position (percentage)
        this.backgroundBlur = 0;
        this.isDragMode = false;
        this.isDragging = false;
        
        // Cache for loaded images to prevent reloading
        this.imageCache = new Map();
        this.baseCanvas = null; // Cache base image without badge for smooth dragging
        this.animationFrameId = null; // For throttling renders during drag
        
        this.initializeEventListeners();
        this.loadAssets();
        this.setupCanvas();
    }

    loadSampleAssets() {
        console.log('Loading sample assets...');
        
        // Clear existing assets
        ['framesGrid', 'badgesGrid', 'backgroundsGrid'].forEach(gridId => {
            const grid = document.getElementById(gridId);
            const assetItems = grid.querySelectorAll('.option-item:not(.no-selection)');
            assetItems.forEach(item => item.remove());
        });
        
        // Load samples
        this.createSampleOptions();
        
        // Show confirmation
        const btn = document.getElementById('loadSamplesBtn');
        const originalText = btn.textContent;
        btn.textContent = '✅ Samples Loaded!';
        btn.style.background = '#4CAF50';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }

    initializeEventListeners() {
        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('imageUpload');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', this.switchTab.bind(this));
        });

        // Controls
        document.getElementById('downloadBtn').addEventListener('click', this.downloadImage.bind(this));
        document.getElementById('resetBtn').addEventListener('click', this.resetAll.bind(this));
        document.getElementById('loadSamplesBtn').addEventListener('click', this.loadSampleAssets.bind(this));
        document.getElementById('badgeSize').addEventListener('input', this.updateBadgeSize.bind(this));
        document.getElementById('badgePosition').addEventListener('change', this.updateBadgePosition.bind(this));
        document.getElementById('badgeX').addEventListener('input', this.updateBadgeCustomPosition.bind(this));
        document.getElementById('badgeY').addEventListener('input', this.updateBadgeCustomPosition.bind(this));
        document.getElementById('backgroundBlur').addEventListener('input', this.updateBackgroundBlur.bind(this));
        document.getElementById('dragModeBtn').addEventListener('click', this.toggleDragMode.bind(this));

        // Canvas interaction for drag mode
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
    }

    async loadAssets() {
        console.log('Loading assets...');
        
        try {
            // Load frames
            const frames = await this.loadAssetsFromFolder('assets/frames/');
            console.log('Frames found:', frames);
            if (frames.length > 0) {
                this.populateOptions('framesGrid', frames, 'frame');
            } else {
                console.log('No frames found, using samples');
                this.createSampleFrames();
            }

            // Load badges
            const badges = await this.loadAssetsFromFolder('assets/badges/');
            console.log('Badges found:', badges);
            if (badges.length > 0) {
                this.populateOptions('badgesGrid', badges, 'badge');
            } else {
                console.log('No badges found, using samples');
                this.createSampleBadges();
            }

            // Load backgrounds
            const backgrounds = await this.loadAssetsFromFolder('assets/backgrounds/');
            console.log('Backgrounds found:', backgrounds);
            if (backgrounds.length > 0) {
                this.populateOptions('backgroundsGrid', backgrounds, 'background');
            } else {
                console.log('No backgrounds found, using samples');
                this.createSampleBackgrounds();
            }
        } catch (error) {
            console.log('Error loading assets, using samples:', error);
            this.createSampleOptions();
        }
    }

    async loadAssetsFromFolder(folderPath) {
        console.log(`🔍 Automatically discovering assets in: ${folderPath}`);
        
        try {
            // First, try to get directory listing from the server
            const assets = await this.discoverAssetsFromServer(folderPath);
            
            if (assets.length > 0) {
                console.log(`✅ Found ${assets.length} assets in ${folderPath}`);
                return assets;
            }
            
            // Fallback: try common asset names for this folder type
            console.log(`⚠️ No directory listing available, trying common asset names...`);
            return await this.tryCommonAssetNames(folderPath);
            
        } catch (error) {
            console.error(`❌ Error discovering assets in ${folderPath}:`, error);
            return await this.tryCommonAssetNames(folderPath);
        }
    }

    async discoverAssetsFromServer(folderPath) {
        const assets = [];
        const supportedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];
        
        try {
            const response = await fetch(folderPath);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const text = await response.text();
            
            // Parse HTML directory listing to extract file names
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const links = doc.querySelectorAll('a[href]');
            
            for (const link of links) {
                const href = link.getAttribute('href');
                
                // Skip navigation links
                if (href === '../' || href === './' || href.startsWith('/')) continue;
                
                // Check if it's a supported image file
                const hasValidExtension = supportedExtensions.some(ext => 
                    href.toLowerCase().endsWith(ext)
                );
                
                if (hasValidExtension) {
                    const fileName = decodeURIComponent(href);
                    assets.push({
                        name: fileName,
                        path: folderPath + href // Use original href to maintain URL encoding if needed
                    });
                    console.log(`📁 Discovered: ${fileName}`);
                }
            }
            
        } catch (error) {
            console.log(`Could not parse directory listing for ${folderPath}:`, error.message);
        }
        
        return assets;
    }

    async tryCommonAssetNames(folderPath) {
        const assets = [];
        const commonNames = this.getCommonAssetNames(folderPath);
        
        console.log(`🔍 Trying ${commonNames.length} common asset names for ${folderPath}`);
        
        for (const fileName of commonNames) {
            try {
                // Test if the file exists by making a HEAD request
                const encodedFileName = fileName.replace(/ /g, '%20');
                const testResponse = await fetch(folderPath + encodedFileName, { method: 'HEAD' });
                
                if (testResponse.ok) {
                    assets.push({
                        name: fileName,
                        path: folderPath + encodedFileName
                    });
                    console.log(`✅ Found common asset: ${fileName}`);
                }
            } catch (e) {
                // Silently ignore individual file errors
            }
        }
        
        return assets;
    }

    getCommonAssetNames(folderPath) {
        // Return common asset names based on folder type
        if (folderPath.includes('frames')) {
            return [
                'Frame1 1.png', 'frame1.svg', 'Frame2 1.png', 'frame2.svg',
                'frame1.png', 'frame2.png', 'frame3.png', 'frame.svg',
                'border1.png', 'border2.png', 'border.svg'
            ];
        } else if (folderPath.includes('badges')) {
            return [
                'certified ready 1.png', 'judge 1.png', 'paticipant 1.png', 'volunteer 1.png',
                'star.svg', 'trophy.svg', 'badge1.png', 'badge2.png', 'badge3.png',
                'medal.svg', 'award.svg', 'crown.svg'
            ];
        } else if (folderPath.includes('backgrounds')) {
            return [
                'Background1 1.png', 'Background2 1.png', 'gradient1.svg', 'gradient2.svg',
                'bg1.png', 'bg2.png', 'bg3.png', 'background.svg',
                'pattern1.svg', 'pattern2.svg'
            ];
        }
        return [];
    }

    createSampleOptions() {
        this.createSampleFrames();
        this.createSampleBadges();
        this.createSampleBackgrounds();
    }

    createSampleFrames() {
        const frameColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
        frameColors.forEach((color, index) => {
            this.addSampleOption('framesGrid', `Frame ${index + 1}`, color, 'frame', `sample-frame-${index}`);
        });
    }

    createSampleBadges() {
        const badgeEmojis = ['🏆', '⭐', '🎯', '🚀', '💎'];
        badgeEmojis.forEach((emoji, index) => {
            this.addSampleOption('badgesGrid', emoji, '#fff', 'badge', `sample-badge-${index}`, emoji);
        });
    }

    createSampleBackgrounds() {
        const backgroundColors = ['#ff9a9e', '#a8edea', '#d299c2', '#fbc2eb', '#c2e9fb'];
        backgroundColors.forEach((color, index) => {
            this.addSampleOption('backgroundsGrid', `BG ${index + 1}`, color, 'background', `sample-bg-${index}`);
        });
    }

    addSampleOption(gridId, label, color, type, value, emoji = '') {
        const grid = document.getElementById(gridId);
        const optionItem = document.createElement('div');
        optionItem.className = 'option-item';
        optionItem.dataset.type = type;
        optionItem.dataset.value = value;

        const preview = document.createElement('div');
        preview.className = 'option-preview';
        preview.style.background = color;
        preview.style.color = type === 'badge' ? '#333' : '#fff';
        preview.style.fontSize = emoji ? '2rem' : '0.8rem';
        preview.textContent = emoji || label;

        optionItem.appendChild(preview);
        optionItem.addEventListener('click', () => this.selectOption(optionItem));
        grid.appendChild(optionItem);
    }

    populateOptions(gridId, assets, type) {
        const grid = document.getElementById(gridId);
        
        assets.forEach(asset => {
            const optionItem = document.createElement('div');
            optionItem.className = 'option-item';
            optionItem.dataset.type = type;
            optionItem.dataset.value = asset.path;

            const preview = document.createElement('div');
            preview.className = 'option-preview';
            
            // Add fallback display initially
            preview.textContent = asset.name.replace(/\.[^/.]+$/, "").replace(/\d+$/, "").trim();
            preview.style.fontSize = '0.7rem';
            preview.style.color = '#666';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.style.backgroundColor = '#f0f0f0';
            preview.style.border = '2px dashed #ccc';
            
            // Handle different file types
            if (asset.path.endsWith('.png') || asset.path.endsWith('.jpg') || asset.path.endsWith('.jpeg')) {
                console.log('Attempting to load PNG/JPG image:', asset.path);
                
                const img = new Image();
                img.onload = () => {
                    console.log('✅ Successfully loaded PNG/JPG:', asset.path);
                    preview.style.backgroundImage = `url("${asset.path}")`;
                    preview.style.backgroundSize = 'contain';
                    preview.style.backgroundRepeat = 'no-repeat';
                    preview.style.backgroundPosition = 'center';
                    preview.style.backgroundColor = '#fff';
                    preview.textContent = ''; // Clear fallback text
                    preview.style.border = '2px solid #4CAF50'; // Green border for success
                };
                img.onerror = (error) => {
                    console.log('❌ Failed to load PNG/JPG:', asset.path, error);
                    preview.style.border = '2px dashed #f44336'; // Red border for error
                    preview.style.backgroundColor = '#ffebee';
                    preview.style.color = '#f44336';
                    preview.textContent = 'Load Failed';
                };
                
                // Try to prevent tainted canvas
                img.crossOrigin = 'anonymous';
                img.src = asset.path;
            } 
            // Handle SVG files
            else if (asset.path.endsWith('.svg')) {
                console.log('Attempting to load SVG:', asset.path);
                
                fetch(asset.path)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}`);
                        }
                        return response.text();
                    })
                    .then(svgContent => {
                        console.log('✅ Successfully loaded SVG:', asset.path);
                        preview.innerHTML = svgContent;
                        const svg = preview.querySelector('svg');
                        if (svg) {
                            svg.style.width = '100%';
                            svg.style.height = '100%';
                            svg.style.objectFit = 'contain';
                        }
                        preview.style.border = '2px solid #4CAF50'; // Green border for success
                        preview.style.backgroundColor = '#fff';
                    })
                    .catch(error => {
                        console.log('❌ Failed to load SVG:', asset.path, error);
                        preview.style.border = '2px dashed #f44336'; // Red border for error
                        preview.style.backgroundColor = '#ffebee';
                        preview.style.color = '#f44336';
                        preview.textContent = 'Load Failed';
                    });
            }
            
            // Add a label under the preview
            const label = document.createElement('div');
            label.style.fontSize = '0.8rem';
            label.style.color = '#666';
            label.style.marginTop = '5px';
            label.style.textAlign = 'center';
            // Clean up the filename for display
            let cleanName = asset.name.replace(/\.[^/.]+$/, "").replace(/\d+$/, "").trim();
            label.textContent = cleanName;
            
            optionItem.appendChild(preview);
            optionItem.appendChild(label);
            optionItem.addEventListener('click', () => this.selectOption(optionItem));
            grid.appendChild(optionItem);
        });
    }

    setupCanvas() {
        this.ctx.fillStyle = '#f0f0f0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Add placeholder text
        this.ctx.fillStyle = '#999';
        this.ctx.font = '18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Upload an image to get started', this.canvas.width / 2, this.canvas.height / 2);
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.currentTarget.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.loadImage(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.loadImage(file);
        }
    }

    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this.renderCanvas();
                document.getElementById('downloadBtn').disabled = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    switchTab(e) {
        const tabName = e.target.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    selectOption(optionItem) {
        const type = optionItem.dataset.type;
        const value = optionItem.dataset.value;
        
        // Update active state
        optionItem.parentElement.querySelectorAll('.option-item').forEach(item => 
            item.classList.remove('active'));
        optionItem.classList.add('active');
        
        // Apply the selection
        switch (type) {
            case 'frame':
                this.currentFrame = value;
                // Pre-load frame image if it's an asset
                if (value && !value.startsWith('sample-')) {
                    this.getImageFromCache(value);
                }
                break;
            case 'badge':
                this.currentBadge = value;
                // Pre-load badge image if it's an asset
                if (value && !value.startsWith('sample-')) {
                    this.getImageFromCache(value);
                }
                
                // Auto-enable drag mode when a badge is selected (but not for "No Badge")
                if (value && value !== '') {
                    if (!this.isDragMode) {
                        this.isDragMode = true;
                        const btn = document.getElementById('dragModeBtn');
                        const canvasContainer = document.querySelector('.canvas-container');
                        
                        btn.textContent = '🔒 Disable Drag Mode';
                        btn.classList.remove('btn-secondary');
                        btn.classList.add('btn-primary');
                        this.canvas.style.cursor = 'grab';
                        canvasContainer.classList.add('drag-mode');
                        
                        // Switch to custom position when drag mode is enabled
                        document.getElementById('badgePosition').value = 'custom';
                        this.badgePosition = 'custom';
                        this.updateBadgePosition({ target: { value: 'custom' } });
                        
                        console.log('🖱️ Auto-enabled drag mode for badge positioning');
                    }
                } else {
                    // Disable drag mode when "No Badge" is selected
                    if (this.isDragMode) {
                        this.isDragMode = false;
                        const btn = document.getElementById('dragModeBtn');
                        const canvasContainer = document.querySelector('.canvas-container');
                        
                        btn.textContent = '🖱️ Enable Drag Mode';
                        btn.classList.remove('btn-primary');
                        btn.classList.add('btn-secondary');
                        this.canvas.style.cursor = 'default';
                        canvasContainer.classList.remove('drag-mode');
                        
                        console.log('🔒 Auto-disabled drag mode (no badge selected)');
                    }
                }
                break;
            case 'background':
                this.currentBackground = value;
                // Pre-load background image if it's an asset
                if (value && !value.startsWith('sample-')) {
                    this.getImageFromCache(value);
                }
                break;
        }
        
        this.renderCanvas();
    }

    updateBadgeSize(e) {
        this.badgeSize = parseInt(e.target.value);
        this.renderCanvas();
    }

    updateBadgePosition(e) {
        this.badgePosition = e.target.value;
        
        // Show/hide custom position controls
        const customControls = document.getElementById('customPositionControls');
        if (this.badgePosition === 'custom') {
            customControls.style.display = 'flex';
            customControls.style.gap = '20px';
            customControls.style.flexWrap = 'wrap';
        } else {
            customControls.style.display = 'none';
        }
        
        this.renderCanvas();
    }

    updateBadgeCustomPosition(e) {
        if (e.target.id === 'badgeX') {
            this.badgeX = parseInt(e.target.value);
        } else if (e.target.id === 'badgeY') {
            this.badgeY = parseInt(e.target.value);
        }
        this.renderCanvas();
    }

    toggleDragMode() {
        this.isDragMode = !this.isDragMode;
        const btn = document.getElementById('dragModeBtn');
        const canvasContainer = document.querySelector('.canvas-container');
        
        if (this.isDragMode) {
            btn.textContent = '🔒 Disable Drag Mode';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
            this.canvas.style.cursor = 'grab';
            canvasContainer.classList.add('drag-mode');
            
            // Switch to custom position when drag mode is enabled
            document.getElementById('badgePosition').value = 'custom';
            this.badgePosition = 'custom';
            this.updateBadgePosition({ target: { value: 'custom' } });
        } else {
            btn.textContent = '🖱️ Enable Drag Mode';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            this.canvas.style.cursor = 'default';
            canvasContainer.classList.remove('drag-mode');
        }
    }

    handleMouseDown(e) {
        if (!this.isDragMode || !this.currentBadge) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // Check if click is near the badge
        const badgeXPos = this.getBadgeXPercent();
        const badgeYPos = this.getBadgeYPercent();
        const threshold = 15; // 15% threshold for clicking near badge
        
        if (Math.abs(x - badgeXPos) < threshold && Math.abs(y - badgeYPos) < threshold) {
            this.isDragging = true;
            this.canvas.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        if (!this.isDragMode || !this.isDragging || !this.currentBadge) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        
        this.badgeX = x;
        this.badgeY = y;
        
        // Update sliders
        document.getElementById('badgeX').value = x;
        document.getElementById('badgeY').value = y;
        
        // Throttle rendering using requestAnimationFrame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.animationFrameId = requestAnimationFrame(() => {
            this.renderWithCachedBase();
        });
    }

    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.canvas.style.cursor = this.isDragMode ? 'grab' : 'default';
            
            // Do a full render when drag ends to ensure everything is properly rendered
            this.renderCanvas();
        }
    }

    updateBackgroundBlur(e) {
        this.backgroundBlur = parseInt(e.target.value);
        this.renderCanvas();
    }

    async renderCanvas() {
        if (!this.originalImage) return;
        
        // If we're dragging, use the optimized render method
        if (this.isDragging) {
            this.renderWithCachedBase();
            return;
        }
        
        // Full render for normal updates
        await this.fullRender();
        
        // Cache the base image (without badge) for smooth dragging
        if (this.currentBadge) {
            this.cacheBaseImage();
        }
    }

    async fullRender() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Calculate image dimensions to fit canvas while maintaining aspect ratio
        const { width, height, x, y } = this.calculateImageDimensions();
        
        // Apply background if selected
        if (this.currentBackground) {
            if (this.currentBackground.startsWith('sample-bg-')) {
                this.renderSampleBackground();
            } else {
                await this.renderAssetBackground();
            }
        }
        
        // Apply background blur if needed
        if (this.backgroundBlur > 0) {
            this.ctx.filter = `blur(${this.backgroundBlur}px)`;
        }
        
        // Draw main image
        this.ctx.filter = 'none';
        this.ctx.drawImage(this.originalImage, x, y, width, height);
        
        // Apply frame if selected
        if (this.currentFrame) {
            if (this.currentFrame.startsWith('sample-frame-')) {
                this.renderSampleFrame(x, y, width, height);
            } else {
                await this.renderAssetFrame(x, y, width, height);
            }
        }
        
        // Apply badge if selected
        if (this.currentBadge) {
            if (this.currentBadge.startsWith('sample-badge-')) {
                this.renderSampleBadge();
            } else {
                await this.renderAssetBadge();
            }
        }
    }

    cacheBaseImage() {
        // Create a temporary canvas to store the image without badge
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Copy current canvas content
        tempCtx.drawImage(this.canvas, 0, 0);
        
        // Remove the badge by redrawing everything except the badge
        this.renderBaseWithoutBadge(tempCtx);
        
        // Store the base image
        this.baseCanvas = tempCanvas;
    }

    async renderBaseWithoutBadge(ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const { width, height, x, y } = this.calculateImageDimensions();
        
        // Apply background if selected
        if (this.currentBackground) {
            if (this.currentBackground.startsWith('sample-bg-')) {
                const originalCtx = this.ctx;
                this.ctx = ctx;
                this.renderSampleBackground();
                this.ctx = originalCtx;
            } else {
                const img = await this.getImageFromCache(this.currentBackground);
                if (img) {
                    ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
                }
            }
        }
        
        // Apply background blur if needed
        if (this.backgroundBlur > 0) {
            ctx.filter = `blur(${this.backgroundBlur}px)`;
        }
        
        // Draw main image
        ctx.filter = 'none';
        ctx.drawImage(this.originalImage, x, y, width, height);
        
        // Apply frame if selected
        if (this.currentFrame) {
            if (this.currentFrame.startsWith('sample-frame-')) {
                const originalCtx = this.ctx;
                this.ctx = ctx;
                this.renderSampleFrame(x, y, width, height);
                this.ctx = originalCtx;
            } else {
                const img = await this.getImageFromCache(this.currentFrame);
                if (img) {
                    const frameSize = Math.max(width, height) + 40;
                    const frameX = x - 20;
                    const frameY = y - 20;
                    ctx.drawImage(img, frameX, frameY, frameSize, frameSize);
                }
            }
        }
    }

    renderWithCachedBase() {
        if (!this.baseCanvas) return;
        
        // Clear and draw the cached base image
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.baseCanvas, 0, 0);
        
        // Only render the badge at new position
        if (this.currentBadge) {
            if (this.currentBadge.startsWith('sample-badge-')) {
                this.renderSampleBadge();
            } else {
                this.renderCachedAssetBadge();
            }
        }
    }

    async getImageFromCache(src) {
        if (this.imageCache.has(src)) {
            return this.imageCache.get(src);
        }
        
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.imageCache.set(src, img);
                resolve(img);
            };
            img.onerror = () => resolve(null);
            // Add crossOrigin to prevent tainted canvas when possible
            img.crossOrigin = 'anonymous';
            img.src = src;
        });
    }

    renderCachedAssetBadge() {
        const img = this.imageCache.get(this.currentBadge);
        if (img) {
            const badgeX = this.getBadgeX() - this.badgeSize / 2;
            const badgeY = this.getBadgeY() - this.badgeSize / 2;
            this.ctx.drawImage(img, badgeX, badgeY, this.badgeSize, this.badgeSize);
        }
    }

    calculateImageDimensions() {
        const canvasRatio = this.canvas.width / this.canvas.height;
        const imageRatio = this.originalImage.width / this.originalImage.height;
        
        let width, height, x, y;
        
        if (imageRatio > canvasRatio) {
            // Image is wider
            width = this.canvas.width;
            height = this.canvas.width / imageRatio;
            x = 0;
            y = (this.canvas.height - height) / 2;
        } else {
            // Image is taller
            width = this.canvas.height * imageRatio;
            height = this.canvas.height;
            x = (this.canvas.width - width) / 2;
            y = 0;
        }
        
        return { width, height, x, y };
    }

    renderSampleBackground() {
        const colors = ['#ff9a9e', '#a8edea', '#d299c2', '#fbc2eb', '#c2e9fb'];
        const index = parseInt(this.currentBackground.split('-')[2]);
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, colors[index]);
        gradient.addColorStop(1, this.adjustBrightness(colors[index], -20));
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderSampleFrame(x, y, width, height) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
        const index = parseInt(this.currentFrame.split('-')[2]);
        const frameWidth = 20;
        
        this.ctx.strokeStyle = colors[index];
        this.ctx.lineWidth = frameWidth;
        this.ctx.strokeRect(x - frameWidth/2, y - frameWidth/2, width + frameWidth, height + frameWidth);
        
        // Add inner shadow effect
        this.ctx.strokeStyle = this.adjustBrightness(colors[index], -30);
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
    }

    renderSampleBadge() {
        const emojis = ['🏆', '⭐', '🎯', '🚀', '💎'];
        const index = parseInt(this.currentBadge.split('-')[2]);
        const emoji = emojis[index];
        
        const badgeX = this.getBadgeX();
        const badgeY = this.getBadgeY();
        
        // Draw badge background
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.beginPath();
        this.ctx.arc(badgeX, badgeY, this.badgeSize / 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw badge border
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Draw emoji
        this.ctx.font = `${this.badgeSize * 0.6}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#333';
        this.ctx.fillText(emoji, badgeX, badgeY);
    }

    getBadgeX() {
        const margin = this.badgeSize / 2 + 10;
        const centerX = this.canvas.width / 2;
        
        switch (this.badgePosition) {
            case 'top-left':
            case 'center-left':
            case 'bottom-left':
                return margin;
            case 'top-center':
            case 'center':
            case 'bottom-center':
                return centerX;
            case 'top-right':
            case 'center-right':
            case 'bottom-right':
                return this.canvas.width - margin;
            case 'custom':
                return (this.badgeX / 100) * this.canvas.width;
            default:
                return margin;
        }
    }

    getBadgeY() {
        const margin = this.badgeSize / 2 + 10;
        const centerY = this.canvas.height / 2;
        
        switch (this.badgePosition) {
            case 'top-left':
            case 'top-center':
            case 'top-right':
                return margin;
            case 'center-left':
            case 'center':
            case 'center-right':
                return centerY;
            case 'bottom-left':
            case 'bottom-center':
            case 'bottom-right':
                return this.canvas.height - margin;
            case 'custom':
                return (this.badgeY / 100) * this.canvas.height;
            default:
                return margin;
        }
    }

    getBadgeXPercent() {
        return (this.getBadgeX() / this.canvas.width) * 100;
    }

    getBadgeYPercent() {
        return (this.getBadgeY() / this.canvas.height) * 100;
    }

    adjustBrightness(color, amount) {
        const usePound = color[0] === '#';
        color = color.slice(usePound ? 1 : 0);
        const num = parseInt(color, 16);
        let r = (num >> 16) + amount;
        let b = (num >> 8 & 0x00FF) + amount;
        let g = (num & 0x0000FF) + amount;
        r = r > 255 ? 255 : r < 0 ? 0 : r;
        b = b > 255 ? 255 : b < 0 ? 0 : b;
        g = g > 255 ? 255 : g < 0 ? 0 : g;
        return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
    }

    async renderAssetBackground() {
        const img = await this.getImageFromCache(this.currentBackground);
        if (img) {
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        }
    }

    async renderAssetFrame(x, y, width, height) {
        const img = await this.getImageFromCache(this.currentFrame);
        if (img) {
            // Scale frame to fit around the image
            const frameSize = Math.max(width, height) + 40;
            const frameX = x - 20;
            const frameY = y - 20;
            this.ctx.drawImage(img, frameX, frameY, frameSize, frameSize);
        }
    }

    async renderAssetBadge() {
        const img = await this.getImageFromCache(this.currentBadge);
        if (img) {
            const badgeX = this.getBadgeX() - this.badgeSize / 2;
            const badgeY = this.getBadgeY() - this.badgeSize / 2;
            this.ctx.drawImage(img, badgeX, badgeY, this.badgeSize, this.badgeSize);
        }
    }

    downloadImage() {
        try {
            // Try to export the canvas
            const dataURL = this.canvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.download = 'hackathon-2025-profile-picture.png';
            link.href = dataURL;
            link.click();
        } catch (error) {
            console.log('Canvas is tainted, using alternative download method');
            
            // Alternative method: Create a clean canvas without tainted images
            this.downloadWithCleanCanvas();
        }
    }

    async downloadWithCleanCanvas() {
        try {
            // Create a new clean canvas
            const downloadCanvas = document.createElement('canvas');
            downloadCanvas.width = this.canvas.width;
            downloadCanvas.height = this.canvas.height;
            const downloadCtx = downloadCanvas.getContext('2d');
            
            // Render everything using data URLs to avoid taint
            await this.renderForDownload(downloadCtx);
            
            // Try to download the clean canvas
            const dataURL = downloadCanvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.download = 'hackathon-2025-profile-picture.png';
            link.href = dataURL;
            link.click();
            
        } catch (fallbackError) {
            console.log('Download failed, showing alternative options');
            this.showDownloadAlternatives();
        }
    }

    async renderForDownload(ctx) {
        // Calculate image dimensions
        const { width, height, x, y } = this.calculateImageDimensions();
        
        // Apply background if selected (using samples only to avoid taint)
        if (this.currentBackground && this.currentBackground.startsWith('sample-bg-')) {
            const originalCtx = this.ctx;
            this.ctx = ctx;
            this.renderSampleBackground();
            this.ctx = originalCtx;
        }
        
        // Draw main image
        if (this.originalImage) {
            ctx.drawImage(this.originalImage, x, y, width, height);
        }
        
        // Apply frame if selected (using samples only)
        if (this.currentFrame && this.currentFrame.startsWith('sample-frame-')) {
            const originalCtx = this.ctx;
            this.ctx = ctx;
            this.renderSampleFrame(x, y, width, height);
            this.ctx = originalCtx;
        }
        
        // Apply badge if selected (using samples only)
        if (this.currentBadge && this.currentBadge.startsWith('sample-badge-')) {
            const originalCtx = this.ctx;
            this.ctx = ctx;
            this.renderSampleBadge();
            this.ctx = originalCtx;
        }
    }

    showDownloadAlternatives() {
        // Show user instructions for manual download
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            color: white;
            font-family: 'Segoe UI', sans-serif;
        `;
        
        modal.innerHTML = `
            <div style="background: white; color: black; padding: 30px; border-radius: 15px; max-width: 500px; text-align: center;">
                <h3 style="margin-bottom: 20px;">📷 Save Your Profile Picture</h3>
                <p style="margin-bottom: 20px;">Due to browser security, automatic download isn't available with local files.</p>
                <p style="margin-bottom: 20px;"><strong>To save your image:</strong></p>
                <ol style="text-align: left; margin-bottom: 20px;">
                    <li>Right-click on the preview image above</li>
                    <li>Select "Save image as..." or "Copy image"</li>
                    <li>Save it to your desired location</li>
                </ol>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                    Got it!
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-remove modal after 10 seconds
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 10000);
    }

    resetAll() {
        this.originalImage = null;
        this.currentFrame = null;
        this.currentBadge = null;
        this.currentBackground = null;
        this.badgeSize = 80;
        this.badgePosition = 'top-left';
        this.badgeX = 20;
        this.badgeY = 20;
        this.backgroundBlur = 0;
        this.isDragMode = false;
        this.isDragging = false;
        
        // Reset UI
        document.getElementById('badgeSize').value = 80;
        document.getElementById('badgePosition').value = 'top-left';
        document.getElementById('badgeX').value = 20;
        document.getElementById('badgeY').value = 20;
        document.getElementById('backgroundBlur').value = 0;
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('imageUpload').value = '';
        
        // Reset drag mode
        const dragBtn = document.getElementById('dragModeBtn');
        dragBtn.textContent = '🖱️ Enable Drag Mode';
        dragBtn.classList.remove('btn-primary');
        dragBtn.classList.add('btn-secondary');
        this.canvas.style.cursor = 'default';
        
        // Hide custom position controls
        document.getElementById('customPositionControls').style.display = 'none';
        
        // Reset active states
        document.querySelectorAll('.option-item.active').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.no-selection').forEach(item => {
            item.classList.add('active');
        });
        
        this.setupCanvas();
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ProfilePictureCreator();
});
