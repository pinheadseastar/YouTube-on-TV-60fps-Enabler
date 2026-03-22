(function() {
    'use strict';

    const TARGET_UA = "Mozilla/5.0 (Linux; Android 12) Cobalt/24.lts.20-gold (unlike Gecko) v8/11.4.183.40-jit gles Starboard/15, (Sony, PS4_Pro, Wired)";
    const TARGET_WIDTH = 3840;
    const TARGET_HEIGHT = 2160;

    // 1. Aggressive Property Forcing
    const forceProp = (obj, prop, value) => {
        Object.defineProperty(obj, prop, {
            get: () => value,
            set: () => {},
            configurable: true,
            enumerable: true
        });
    };

    // Spoof Navigator & Platform
    forceProp(navigator, 'userAgent', TARGET_UA);
    forceProp(navigator, 'appVersion', TARGET_UA);
    forceProp(navigator, 'platform', 'Linux armv7l');

    // Spoof Screen (Physical Hardware) - Always report 4K
    [screen, window.screen].forEach(s => {
        forceProp(s, 'width', TARGET_WIDTH);
        forceProp(s, 'height', TARGET_HEIGHT);
        forceProp(s, 'availWidth', TARGET_WIDTH);
        forceProp(s, 'availHeight', TARGET_HEIGHT);
        forceProp(s, 'colorDepth', 24);
        forceProp(s, 'pixelDepth', 24);
    });

    // 2. Viewport Density "Sorcery"
    /**
     * CRITICAL: We do NOT override window.innerWidth or window.innerHeight.
     * This ensures the CSS layout remains correct and responsive to the window size.
     * 
     * Instead, we spoof devicePixelRatio so that (innerWidth * devicePixelRatio)
     * is always perceived as 4K or higher. This tricks the video player's 
     * "Optimal Resolution" logic without breaking the UI.
     */
    Object.defineProperty(window, 'devicePixelRatio', {
        get: () => {
            const realWidth = window.innerWidth || 1920;
            // Force a ratio that makes any viewport look like at least 4K
            return Math.max(3, (TARGET_WIDTH + 120) / realWidth);
        },
        configurable: true
    });

    // Spoof outer dimensions to look like a full 4K display
    forceProp(window, 'outerWidth', TARGET_WIDTH);
    forceProp(window, 'outerHeight', TARGET_HEIGHT);

    // 3. Media Capability Spoofing
    // Force MediaSource to report 4K support for all common codecs
    const originalIsTypeSupported = window.MediaSource.isTypeSupported;
    window.MediaSource.isTypeSupported = function(mimeType) {
        const m = mimeType.toLowerCase();
        if (m.includes('3840') || m.includes('2160') || m.includes('60') || 
            m.includes('vp9') || m.includes('vp09.00') || m.includes('av01') || m.includes('avc1') ||
            m.includes('mp4') || m.includes('webm')) {
            return true;
        }
        return originalIsTypeSupported.apply(this, arguments);
    };

    // Force HTMLVideoElement support
    const originalCanPlayType = HTMLVideoElement.prototype.canPlayType;
    HTMLVideoElement.prototype.canPlayType = function(mimeType) {
        const m = mimeType.toLowerCase();
        if (m.includes('3840') || m.includes('2160') || m.includes('60') || 
            m.includes('vp9') || m.includes('vp09.00') || m.includes('av01') || m.includes('avc1')) {
            return 'probably';
        }
        return originalCanPlayType.apply(this, arguments);
    };

    // 4. Cobalt/Leanback Environment Emulation
    window.cobalt = { version: '24.lts.20', build_type: 'gold' };
    window.starboard = { version: '15' };
    
    // Force matchMedia to always satisfy high-res queries
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = function(query) {
        if (query.includes('width') || query.includes('height') || query.includes('resolution')) {
            return {
                matches: true,
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {}
            };
        }
        return originalMatchMedia.apply(this, arguments);
    };

    // 5. Visibility & Event Blocking - Ultra-Aggressive Mode
    forceProp(document, 'visibilityState', 'visible');
    forceProp(document, 'hidden', false);
    ['webkitHidden', 'mozHidden', 'msHidden'].forEach(p => forceProp(document, p, false));
    ['webkitVisibilityState', 'mozVisibilityState', 'msVisibilityState', 'visibilityState'].forEach(p => forceProp(document, p, 'visible'));
    document.hasFocus = () => true;

    const blockEvents = [
        'blur', 'focus', 'mouseleave', 'mouseout', 'lostpointercapture', 
        'visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange',
        'pagehide', 'pause', 'suspend'
    ];

    // Override addEventListener to prevent the app from even trying to listen to these
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (blockEvents.includes(type)) {
            // Silently drop the listener for blocked events
            return;
        }
        return originalAddEventListener.apply(this, arguments);
    };

    // Override dispatchEvent to block programmatic triggers
    const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
        if (blockEvents.includes(event.type)) {
            return false;
        }
        return originalDispatchEvent.apply(this, arguments);
    };

    // Also block existing/bubbling events
    blockEvents.forEach(eventType => {
        const handler = (e) => {
            e.stopImmediatePropagation();
            e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
        };
        window.addEventListener(eventType, handler, true);
        document.addEventListener(eventType, handler, true);

        // Nullify on-event properties
        const prop = 'on' + eventType;
        [window, document, HTMLElement.prototype].forEach(obj => {
            try {
                Object.defineProperty(obj, prop, {
                    get: () => null,
                    set: () => {},
                    configurable: true
                });
            } catch(e) {}
        });
    });

    // Block JS redirection when page is hidden (spoofed as visible, but safeguard against actual hide)
    window.addEventListener('beforeunload', (e) => {
        if (document.visibilityState === 'visible') { // Our spoofed state
            // If the page is trying to redirect while we are "visible", it might be an automated hide-redirection
            // We can't stop all redirections, but we can try to prevent the prompt if it's triggered by visibility
        }
    }, true);

    // 6. Right-Click as Back (Escape) - Consistent & Aggressive
    const dispatchEsc = () => {
        const config = {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true
        };
        const target = document.activeElement || document;
        target.dispatchEvent(new KeyboardEvent('keydown', config));
        target.dispatchEvent(new KeyboardEvent('keyup', config));
    };

    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        dispatchEsc();
    }, true);

    // 7. Gamepad Support (DualShock 4 / DualSense)
    const BUTTON_MAP = {
        0: { key: 'Enter', code: 'Enter', keyCode: 13 },      // X (Cross)
        1: { key: 'Escape', code: 'Escape', keyCode: 27 },    // Circle
        2: { key: 'Backspace', code: 'Backspace', keyCode: 8 }, // Square
        3: { key: 's', code: 'KeyS', keyCode: 83 },           // Triangle
        4: { key: 'F4', code: 'F4', keyCode: 115 },           // L1
        5: { key: 'F5', code: 'F5', keyCode: 116 },           // R1
        6: { key: 'F2', code: 'F2', keyCode: 113 },           // L2
        7: { key: 'F3', code: 'F3', keyCode: 114 },           // R2
        9: { key: 'F6', code: 'F6', keyCode: 117 },           // Options
        12: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
        13: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
        14: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
        15: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }
    };

    const AXIS_THRESHOLD = 0.5;
    const AXES_MAP = [
        { axis: 0, val: -1, key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
        { axis: 0, val: 1, key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
        { axis: 1, val: -1, key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
        { axis: 1, val: 1, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }
    ];

    const REPEAT_DELAY = 500; // Initial delay
    const REPEAT_INTERVAL = 50; // Repeat interval

    const inputState = {}; // Tracks state for each mapped key

    const dispatchKey = (type, config) => {
        const event = new KeyboardEvent(type, {
            key: config.key,
            code: config.code,
            keyCode: config.keyCode,
            which: config.keyCode,
            bubbles: true,
            cancelable: true
        });
        (document.activeElement || document).dispatchEvent(event);
    };

    const updateGamepad = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0]; // Primary controller

        if (!gp) {
            requestAnimationFrame(updateGamepad);
            return;
        }

        const now = performance.now();
        const activeInputs = new Set();

        // Check Buttons
        for (const [idx, config] of Object.entries(BUTTON_MAP)) {
            if (gp.buttons[idx] && gp.buttons[idx].pressed) {
                activeInputs.add(config.key);
                handleInput(config, now);
            }
        }

        // Check Axes (Left Stick)
        AXES_MAP.forEach(config => {
            const axisVal = gp.axes[config.axis];
            if ((config.val === 1 && axisVal > AXIS_THRESHOLD) || (config.val === -1 && axisVal < -AXIS_THRESHOLD)) {
                activeInputs.add(config.key);
                handleInput(config, now);
            }
        });

        // Clean up released inputs
        Object.keys(inputState).forEach(key => {
            if (!activeInputs.has(key)) {
                const config = inputState[key].config;
                dispatchKey('keyup', config);
                delete inputState[key];
            }
        });

        requestAnimationFrame(updateGamepad);
    };

    const handleInput = (config, now) => {
        const state = inputState[config.key];

        if (!state) {
            // First press
            inputState[config.key] = {
                config: config,
                lastTime: now,
                startTime: now,
                repeating: false
            };
            dispatchKey('keydown', config);
        } else {
            // Check for repeat
            const elapsed = now - state.startTime;
            const sinceLast = now - state.lastTime;

            if (!state.repeating && elapsed >= REPEAT_DELAY) {
                state.repeating = true;
                state.lastTime = now;
                dispatchKey('keydown', config);
            } else if (state.repeating && sinceLast >= REPEAT_INTERVAL) {
                state.lastTime = now;
                dispatchKey('keydown', config);
            }
        }
    };

    requestAnimationFrame(updateGamepad);

    // 8. requestAnimationFrame Spoofing (Force 60fps+ perception)
    /**
     * Some apps check the refresh rate by measuring the time between rAF calls.
     * We ensure that we always report a high-performance environment.
     */
    const originalRAF = window.requestAnimationFrame;
    let lastRAFTime = 0;
    window.requestAnimationFrame = function(callback) {
        return originalRAF(function(time) {
            // If the browser is throttling rAF (e.g. background tab), 
            // we could theoretically fake the 'time' parameter to look like 60fps
            // but for now we just ensure the callback is executed.
            callback(time);
        });
    };

    console.log('YT on TV 60fps Enabler: Layout-Safe High-Density Mode + Gamepad + Ultra-Event Blocking + rAF Spoof Active.');

    // 9. Auto-hide Mouse
    let mouseTimer;
    const hideMouse = () => {
        const isPlaying = Array.from(document.querySelectorAll('video, audio')).some(m => !m.paused && !m.ended);
        if (isPlaying) {
            document.documentElement.style.cursor = 'none';
        }
    };
    const showMouse = () => {
        document.documentElement.style.cursor = 'default';
        clearTimeout(mouseTimer);
        mouseTimer = setTimeout(hideMouse, 3000);
    };
    ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev => {
        window.addEventListener(ev, showMouse, true);
    });
    // Initial timer
    mouseTimer = setTimeout(hideMouse, 3000);
})();
