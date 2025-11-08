// Import Kalidokit - use UMD build from CDN (works everywhere)
// The CDN is loaded in index.html, so it should be available as window.Kalidokit
let Kalidokit;

// Get Kalidokit from CDN (loaded in HTML)
if (typeof window !== 'undefined' && window.Kalidokit) {
    Kalidokit = window.Kalidokit;
} else {
    // Fallback if CDN fails (shouldn't happen, but just in case)
    console.warn("Kalidokit CDN not loaded. Using fallback. Check your internet connection.");
    Kalidokit = {
        Utils: { remap: (x) => x, clamp: (x, min, max) => Math.max(min, Math.min(max, x)) },
        Vector: { lerp: (a, b, t) => a + (b - a) * t },
        Face: { solve: () => ({}), stabilizeBlink: (eye) => eye },
        Pose: { solve: () => ({}) },
        Hand: { solve: () => ({}) }
    };
}

//Import Helper Functions from Kalidokit
const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

/* THREEJS WORLD SETUP */
let currentVrm;
let currentFBXModel = null; // For FBX models like Remy
let isFBXModel = false; // Track if we're using FBX or VRM

// renderer
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for mobile performance
document.body.appendChild(renderer.domElement);

// camera
const orbitCamera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(0.0, 1.0, 2.0); // Further back to make model appear smaller

// Handle window resize for mobile responsiveness
window.addEventListener("resize", () => {
    orbitCamera.aspect = window.innerWidth / window.innerHeight;
    orbitCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// controls
const orbitControls = new THREE.OrbitControls(orbitCamera, renderer.domElement);
orbitControls.screenSpacePanning = true;
orbitControls.target.set(0.0, 1.0, 0.0); // Adjusted for centering
orbitControls.update();

// Enable touch controls for mobile
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;

// scene
const scene = new THREE.Scene();

// Add background image
const textureLoader = new THREE.TextureLoader();
const backgroundTexture = textureLoader.load("./background.jpg", () => {
    // Set background as scene background
    scene.background = backgroundTexture;
}, undefined, (error) => {
    console.error("Error loading background image:", error);
    // Fallback to gradient if image fails
    scene.background = new THREE.Color(0x87CEEB);
});

// light
const light = new THREE.DirectionalLight(0xffffff);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

// Add ambient light for better visibility
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);


// Main Render Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (currentVrm) {
        // CRITICAL: Safety check - ensure avatar ALWAYS stays in scene
        if (!scene.children.includes(currentVrm.scene)) {
            console.warn("Avatar was removed from scene! Re-adding immediately...");
            scene.add(currentVrm.scene);
            // Re-apply position, scale, and rotation
            currentVrm.scene.position.set(0, 0.5, 0);
            currentVrm.scene.scale.set(0.4, 0.4, 0.4);
            currentVrm.scene.rotation.y = Math.PI;
        }
        
        // Update model to render physics
        currentVrm.update(delta);
        
        // Update animation mixer if active (for Mixamo animations)
        if (animationMixer) {
            try {
                // Check avatar before update
                const wasInScene = currentVrm && currentVrm.scene && scene.children.includes(currentVrm.scene);
                
                animationMixer.update(delta);
                
                // CRITICAL: Check if avatar was removed during animation update
                if (currentVrm && currentVrm.scene) {
                    const isInScene = scene.children.includes(currentVrm.scene);
                    if (wasInScene && !isInScene) {
                        console.error("❌ Avatar was removed during animation update! This indicates incompatible animation.");
                        console.warn("Stopping animation to prevent further issues");
                        
                        // Stop all animations immediately
                        animationActions.forEach(action => {
                            if (action && action.isPlaying()) {
                                action.stop();
                                action.reset();
                            }
                        });
                        animationActions = [];
                        animationClips = [];
                        animationNames = [];
                        
                        // Re-add avatar
                        scene.add(currentVrm.scene);
                        currentVrm.scene.position.set(0, 0.5, 0);
                        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                        currentVrm.scene.rotation.y = Math.PI;
                        
                        // Reset button
                        const loadButton = document.getElementById("load-dancing");
                        if (loadButton) {
                            loadButton.textContent = "Load Dancing Animation";
                            loadButton.disabled = false;
                            loadButton.style.background = "";
                        }
                        
                        console.warn("⚠️ DAE animation stopped - format may be incompatible with VRM. Try GLB format instead.");
                    } else if (!isInScene) {
                        // Avatar not in scene - re-add it
                        console.warn("Avatar not in scene during animation update! Re-adding...");
                        scene.add(currentVrm.scene);
                        currentVrm.scene.position.set(0, 0.5, 0);
                        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                        currentVrm.scene.rotation.y = Math.PI;
                    }
                }
            } catch (error) {
                console.error("Error updating animation mixer:", error);
                // Stop animations if they cause errors
                animationActions.forEach(action => {
                    if (action && action.isPlaying()) {
                        action.stop();
                        action.reset();
                    }
                });
                animationActions = [];
                
                // Ensure avatar stays in scene even if animation fails
                if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                    console.warn("Re-adding avatar after animation error");
                    scene.add(currentVrm.scene);
                    currentVrm.scene.position.set(0, 0.5, 0);
                    currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                    currentVrm.scene.rotation.y = Math.PI;
                }
            }
        }
        
        // Update idle animation mixer if active (legacy)
        if (idleAnimationMixer) {
            idleAnimationMixer.update(delta);
        }
        
        // Simple idle rotation when tracking is disabled or not active
        const currentModel = isFBXModel ? currentFBXModel : (currentVrm ? currentVrm.scene : null);
        
        if (!isTrackingEnabled && currentModel) {
            // Rotate continuously when tracking is disabled
            currentModel.rotation.y += idleRotationSpeed * delta;
            
            // Avatar interaction with cubes when tracking is disabled (only for VRM)
            if (!isFBXModel && currentVrm) {
                avatarPushCubes(delta);
            }
            
            // Animate interactive cubes
            interactiveCubes.forEach(cube => {
                if (!cube.userData.isDragging) {
                    cube.rotation.x += cube.userData.rotationSpeed.x;
                    cube.rotation.y += cube.userData.rotationSpeed.y;
                    cube.rotation.z += cube.userData.rotationSpeed.z;
                    
                    // Float animation (only if not being pushed by avatar)
                    if (!cube.userData.isBeingPushed) {
                        cube.position.y = cube.userData.originalPosition.y + Math.sin(Date.now() * 0.001 + cube.userData.originalPosition.x) * 0.2;
                    }
                }
            });
        } else if (isTrackingEnabled && !isTrackingActive && currentModel) {
            // Rotate when tracking is enabled but no tracking detected (waiting)
            currentModel.rotation.y += idleRotationSpeed * delta;
        }
        
        // Push cubes with hands when tracking is active
        if (isTrackingEnabled && isTrackingActive) {
            pushCubesWithHands();
            
            // Animate cubes (rotation) even when being pushed
            interactiveCubes.forEach(cube => {
                cube.rotation.x += cube.userData.rotationSpeed.x;
                cube.rotation.y += cube.userData.rotationSpeed.y;
                cube.rotation.z += cube.userData.rotationSpeed.z;
            });
        }
    }
    
    // Update orbit controls
    orbitControls.update();
    
    renderer.render(scene, orbitCamera);
}
animate();

/* VRM CHARACTER SETUP */

// Function to load VRM model
function loadVRMModel(fileOrUrl) {
const loader = new THREE.GLTFLoader();
loader.crossOrigin = "anonymous";
    
    // Remove existing model if any
    if (currentVrm && currentVrm.scene) {
        scene.remove(currentVrm.scene);
        currentVrm = null;
    }
    
    const onLoad = (gltf) => {
        THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);

        THREE.VRM.from(gltf).then((vrm) => {
            scene.add(vrm.scene);
            currentVrm = vrm;
            currentVrm.scene.rotation.y = Math.PI; // Rotate model 180deg to face camera
            currentVrm.scene.scale.set(0.4, 0.4, 0.4); // Make avatar smaller
            currentVrm.scene.position.set(0, 0.5, 0); // Center and position model lower
            
            // Load idle animation (Mixamo format)
            loadIdleAnimation(vrm);
            
            // Start with idle animation (tracking disabled by default)
            if (!isTrackingEnabled && currentVrm.scene) {
                // Animation will start in the animate loop
            }
            
            console.log("VRM model loaded successfully!");
        }).catch((error) => {
            console.error("Error processing VRM:", error);
            alert("Error loading VRM model. Please make sure it's a valid VRM file.");
        });
    };

    const onProgress = (progress) => {
        if (progress.total > 0) {
            console.log("Loading model...", 100.0 * (progress.loaded / progress.total), "%");
        }
    };

    const onError = (error) => {
        console.error("Error loading model:", error);
        alert("Error loading VRM model. Please try another file.");
    };

    // Load from file or URL
    if (fileOrUrl instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                // VRM files are binary GLTF files, parse as ArrayBuffer
                loader.parse(e.target.result, "", onLoad, onError);
            } catch (error) {
                console.error("Parse error:", error);
                onError(error);
            }
        };
        reader.onerror = (error) => {
            console.error("FileReader error:", error);
            onError(error);
        };
        reader.readAsArrayBuffer(fileOrUrl);
    } else {
        // For URLs, convert relative paths to absolute
        let url = fileOrUrl;
        if (url.startsWith('./') || url.startsWith('../')) {
            // Convert relative path to absolute based on current page location
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
            url = new URL(url, baseUrl).href;
            console.log(`Converted relative path "${fileOrUrl}" to absolute URL: "${url}"`);
        }
        
        // Use fetch with arrayBuffer to have better control and detect HTML responses
        console.log(`Fetching VRM file from: ${url}`);
        fetch(url)
            .then(response => {
                console.log(`Response status: ${response.status} ${response.statusText}`);
                console.log(`Content-Type: ${response.headers.get('Content-Type')}`);
                const contentLength = response.headers.get('Content-Length');
                console.log(`Content-Length header: ${contentLength}`);
                
                if (!response.ok) {
                    console.error(`File not found: ${url} (Status: ${response.status})`);
                    return response.text().then(text => {
                        console.error(`Server returned (first 500 chars): ${text.substring(0, 500)}`);
                        onError(new Error(`File not found: ${response.status} ${response.statusText}`));
                    });
                }
                
                // Check Content-Type
                const contentType = response.headers.get('Content-Type');
                if (contentType && contentType.includes('text/html')) {
                    console.error(`Server returned HTML instead of binary file. Content-Type: ${contentType}`);
                    return response.text().then(text => {
                        console.error(`HTML content (first 500 chars): ${text.substring(0, 500)}`);
                        onError(new Error('Server returned HTML instead of VRM file. File may not be deployed.'));
                    });
                }
                
                // Check Content-Length - VRM files should be at least 100KB (100,000 bytes)
                if (contentLength && parseInt(contentLength) < 100000) {
                    console.warn(`Warning: Content-Length is suspiciously small (${contentLength} bytes). VRM files are typically > 1MB.`);
                    // Still try to load, but check the actual data
                }
                
                // Fetch as ArrayBuffer
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                if (!arrayBuffer) {
                    return; // Error already handled
                }
                
                const actualSize = arrayBuffer.byteLength;
                console.log(`File loaded successfully. Actual size: ${(actualSize / 1024 / 1024).toFixed(2)} MB`);
                
                // Check if the file is suspiciously small (likely HTML error page)
                if (actualSize < 100000) {
                    // Try to detect if it's HTML
                    const uint8Array = new Uint8Array(arrayBuffer);
                    const textDecoder = new TextDecoder();
                    const firstBytes = textDecoder.decode(uint8Array.slice(0, 200));
                    
                    if (firstBytes.includes('<html') || firstBytes.includes('<!DOCTYPE') || firstBytes.includes('version ht')) {
                        console.error(`Server returned HTML/error page instead of VRM file. Size: ${actualSize} bytes`);
                        console.error(`Content (first 500 chars): ${firstBytes.substring(0, 500)}`);
                        onError(new Error(`VRM file appears to be an error page (${actualSize} bytes). File may not be properly deployed on Vercel.`));
                        return;
                    }
                }
                
                // File looks valid, parse it
                console.log(`Parsing VRM file...`);
                try {
                    loader.parse(arrayBuffer, url, onLoad, onError);
                } catch (parseError) {
                    console.error("Parse error:", parseError);
                    onError(parseError);
                }
            })
            .catch(fetchError => {
                console.error("Failed to fetch file:", fetchError);
                onError(fetchError);
            });
    }
}

// Animation system for Mixamo animations
let animationMixer = null;
let animationActions = [];
let currentAnimationIndex = 0;
let animationClips = [];
let animationNames = []; // Store animation names for reference
let animationLoadCount = 0;
let totalAnimationsToLoad = 0;

// Function to load idle animations (Mixamo format)
function loadIdleAnimation(vrm) {
    console.log("Loading Mixamo animations...");
    
    // Initialize animation mixer for VRM model
    if (!animationMixer && vrm && vrm.scene) {
        animationMixer = new THREE.AnimationMixer(vrm.scene);
        console.log("Animation mixer initialized");
    }
    
    // Mixamo animation files - Support both local files and URLs
    // IMPORTANT: Use GLB format (not FBX) for better VRM compatibility!
    // Download from Mixamo.com: Choose "glTF" format when downloading
    // Local files: Use relative paths from docs/ folder (e.g., "animations/idle.glb")
    // URLs: Use full URLs (e.g., "https://cdn.jsdelivr.net/gh/...")
    const animationFiles = [
        // Add your animations here (supports GLB, FBX, and DAE formats)
        // NOTE: Dancing.dae is loaded manually via button - not auto-loaded to prevent avatar disappearing
        // "animations/Dancing.dae",  // Load manually via "Load Dancing Animation" button
        
        // More examples:
        // "animations/idle.glb",
        // "animations/walking.glb",
        // "animations/dancing.glb",
        
        // Example URLs (after uploading to GitHub):
        // "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/idle.glb",
        // "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/walking.glb",
        // "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/animations/dancing.glb",
    ];
    
    // If no animations provided, use simple rotation
    if (animationFiles.length === 0) {
        console.log("No Mixamo animations configured. Using simple rotation animation.");
        if (!isTrackingEnabled) {
            startIdleRotation();
            createInteractiveCubes();
        }
        return;
    }
    
    // Load Mixamo animations
    totalAnimationsToLoad = animationFiles.length;
    animationLoadCount = 0;
    
    // GLTFLoader is always available (loaded in index.html)
    const gltfLoader = new THREE.GLTFLoader();
    
    // FBXLoader is optional (only needed if using FBX files)
    let fbxLoader = null;
    if (typeof THREE.FBXLoader !== 'undefined') {
        fbxLoader = new THREE.FBXLoader();
    }
    
    // ColladaLoader is optional (only needed if using DAE files)
    let colladaLoader = null;
    if (typeof THREE.ColladaLoader !== 'undefined') {
        colladaLoader = new THREE.ColladaLoader();
    }
    
    animationFiles.forEach((filePath, index) => {
        console.log(`Loading animation ${index + 1}/${totalAnimationsToLoad}: ${filePath}`);
        
        // Determine file type and use appropriate loader
        const isFBX = filePath.toLowerCase().endsWith('.fbx');
        const isGLB = filePath.toLowerCase().endsWith('.glb') || filePath.toLowerCase().endsWith('.gltf');
        const isDAE = filePath.toLowerCase().endsWith('.dae');
        
        // Prefer GLB format for VRM compatibility
        if (isFBX && !fbxLoader) {
            console.warn(`FBX file detected but FBXLoader not available. Skipping: ${filePath}`);
            animationLoadCount++;
            if (animationLoadCount === totalAnimationsToLoad) {
                checkAndStartAnimations();
            }
            return;
        }
        
        if (isDAE && !colladaLoader) {
            console.warn(`DAE file detected but ColladaLoader not available. Skipping: ${filePath}`);
            animationLoadCount++;
            if (animationLoadCount === totalAnimationsToLoad) {
                checkAndStartAnimations();
            }
            return;
        }
        
        const loader = isFBX ? fbxLoader : (isDAE ? colladaLoader : gltfLoader);
        
        loader.load(
            filePath,
            (loaded) => {
                try {
                    let clips = [];
                    
                    if (isFBX) {
                        // FBX format: animations are in the loaded object
                        if (loaded.animations && loaded.animations.length > 0) {
                            clips = loaded.animations;
                        } else {
                            console.warn(`No animations found in FBX file ${index + 1}: ${filePath}`);
                        }
                    } else if (isDAE) {
                        // COLLADA (DAE) format: animations are in scene.animations (new API)
                        // IMPORTANT: Do NOT add loaded.scene to the scene - we only want the animations!
                        // ColladaLoader returns an object with 'scene' containing the model and animations
                        if (loaded.scene && loaded.scene.animations && loaded.scene.animations.length > 0) {
                            // New API: animations are in scene.animations
                            clips = loaded.scene.animations;
                            console.log(`Found ${clips.length} animation(s) in DAE scene.animations`);
                        } else if (loaded.animations && loaded.animations.length > 0) {
                            // Fallback: old API (deprecated)
                            clips = loaded.animations;
                            console.log(`Found ${clips.length} animation(s) in DAE animations (deprecated API)`);
                        } else {
                            // Try to extract animations from the scene hierarchy
                            const extractAnimations = (object) => {
                                if (object.animations && object.animations.length > 0) {
                                    return object.animations;
                                }
                                let found = [];
                                if (object.children) {
                                    object.children.forEach(child => {
                                        found = found.concat(extractAnimations(child));
                                    });
                                }
                                return found;
                            };
                            clips = extractAnimations(loaded.scene || loaded);
                            if (clips.length === 0) {
                                console.warn(`No animations found in DAE file ${index + 1}: ${filePath}`);
                            } else {
                                console.log(`Extracted ${clips.length} animation(s) from DAE scene hierarchy`);
                            }
                        }
                        
                        // IMPORTANT: Don't add the DAE model to the scene - we only want animations!
                        // The loaded.scene contains a full 3D model that would interfere with the VRM avatar
                        // We extract only the animation clips and discard the model
                    } else {
                        // GLB/GLTF format: animations are in gltf.animations
                        clips = loaded.animations || [];
                    }
                    
                    if (clips.length > 0) {
                        // Try to retarget animations to VRM skeleton
                        clips.forEach(clip => {
                            try {
                                // For FBX and DAE files, skip retargeting as they often cause issues
                                if (isFBX || isDAE) {
                                    // FBX and DAE animations often don't work well with VRM retargeting
                                    // DAE animations in particular may not be compatible with VRM skeletons
                                    // Use original clip without retargeting, but warn about potential issues
                                    const format = isFBX ? 'FBX' : 'DAE';
                                    console.warn(`${format} animation detected. Skipping retargeting for ${clip.name || `Animation_${index + 1}`}`);
                                    console.warn(`⚠️ ${format} animations may not work correctly with VRM. If avatar disappears, try using GLB format instead.`);
                                    
                                    // Check if clip has valid tracks
                                    if (!clip.tracks || clip.tracks.length === 0) {
                                        console.error(`Animation clip "${clip.name || `Animation_${index + 1}`}" has no tracks - skipping`);
                                        return; // Skip this clip
                                    }
                                    
                                    animationClips.push(clip);
                                    animationNames.push(clip.name || `Animation_${index + 1}`);
                                    console.log(`✓ Loaded ${format} animation (no retargeting): ${clip.name || `Animation_${index + 1}`}`);
                                } else {
                                    // For GLB/GLTF, try retargeting
                                    const retargetedClip = THREE.VRMUtils.retargetAnimation ? 
                                        THREE.VRMUtils.retargetAnimation(clip, vrm) : clip;
                                    
                                    if (retargetedClip) {
                                        animationClips.push(retargetedClip);
                                        animationNames.push(clip.name || `Animation_${index + 1}`);
                                        console.log(`✓ Loaded animation: ${clip.name || `Animation_${index + 1}`} (GLB)`);
                                    } else {
                                        // Fallback: use original clip
                                        animationClips.push(clip);
                                        animationNames.push(clip.name || `Animation_${index + 1}`);
                                        console.log(`✓ Loaded animation (no retargeting): ${clip.name || `Animation_${index + 1}`} (GLB)`);
                                    }
                                }
                            } catch (error) {
                                // If retargeting fails, use original clip
                                console.warn(`Error processing animation ${clip.name}, skipping:`, error);
                                // Don't add the clip if it causes errors
                            }
                        });
                    } else {
                        console.warn(`No animations found in file ${index + 1}: ${filePath}`);
                    }
                } catch (error) {
                    console.error(`Error processing animation file ${index + 1}:`, error);
                }
                
                animationLoadCount++;
                checkAndStartAnimations();
            },
            (progress) => {
                if (progress.total > 0) {
                    const percent = (100.0 * progress.loaded / progress.total).toFixed(1);
                    console.log(`Loading animation ${index + 1}... ${percent}%`);
                }
            },
            (error) => {
                console.error(`Error loading animation ${index + 1} from ${filePath}:`, error);
                animationLoadCount++;
                checkAndStartAnimations();
            }
        );
    });
    
    // Helper function to check if all animations are loaded and start playing
    function checkAndStartAnimations() {
        if (animationLoadCount === totalAnimationsToLoad) {
            console.log(`All animations loaded! Total: ${animationClips.length}`);
            if (!isTrackingEnabled && animationClips.length > 0) {
                // Use setTimeout to ensure everything is ready
                setTimeout(() => {
                    try {
                        playMixamoAnimation(0);
                        console.log(`Playing first animation: ${animationNames[0]}`);
                    } catch (error) {
                        console.error("Error playing animation:", error);
                        // Fallback to simple rotation
                        startIdleRotation();
                        createInteractiveCubes();
                    }
                }, 100);
            } else if (animationClips.length === 0) {
                // No animations loaded, use simple rotation
                console.log("No animations loaded. Using simple rotation.");
                if (!isTrackingEnabled) {
                    startIdleRotation();
                    createInteractiveCubes();
                }
            }
        }
    }
}

// Simple idle rotation animation when tracking is off
let idleRotationSpeed = 0.5; // radians per second
function startIdleRotation() {
    // This will be handled in the animate loop
}

// Function to play Mixamo animation
function playMixamoAnimation(index) {
    // CRITICAL: Ensure avatar is ALWAYS in scene before playing animation
    if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
        console.warn("Avatar not in scene! Re-adding before playing animation...");
        scene.add(currentVrm.scene);
        // Re-apply position, scale, and rotation
        currentVrm.scene.position.set(0, 0.5, 0);
        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
        currentVrm.scene.rotation.y = Math.PI;
    }
    
    if (!currentVrm || !currentVrm.scene) {
        console.error("Cannot play animation: VRM not loaded");
        return;
    }
    
    if (!animationMixer) {
        console.error("Cannot play animation: mixer not initialized");
        return;
    }
    
    if (index < 0 || index >= animationClips.length) {
        console.warn(`Animation index ${index} out of range. Total animations: ${animationClips.length}`);
        return;
    }
    
    try {
        // Stop current animation
        animationActions.forEach(action => {
            if (action && action.isPlaying()) {
                action.fadeOut(0.5);
                action.stop();
            }
        });
        animationActions = []; // Clear array
        
        // Play new animation
        const clip = animationClips[index];
        if (clip && animationMixer) {
            // CRITICAL: Double-check avatar is in scene before creating action
            if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                console.warn("Re-adding avatar before creating animation action");
                scene.add(currentVrm.scene);
                currentVrm.scene.position.set(0, 0.5, 0);
                currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                currentVrm.scene.rotation.y = Math.PI;
            }
            
            try {
                // For DAE animations, we need to be extra careful - they often don't work with VRM
                // Check if this is a DAE animation by checking the clip tracks
                const isDAEAnimation = clip.tracks && clip.tracks.some(track => {
                    // DAE animations often have bone names that don't match VRM
                    const trackName = track.name || '';
                    // VRM bones typically have specific naming patterns
                    return !trackName.includes('mixamorig') && !trackName.includes('Hips') && 
                           !trackName.includes('Spine') && !trackName.includes('Head');
                });
                
                if (isDAEAnimation) {
                    console.warn("⚠️ DAE animation detected - may not work correctly with VRM skeleton");
                    console.warn("If avatar disappears, the animation is incompatible with VRM");
                }
                
                const action = animationMixer.clipAction(clip);
                if (action) {
                    // CRITICAL: Ensure avatar is in scene before playing
                    if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                        console.warn("Re-adding avatar before playing animation action");
                        scene.add(currentVrm.scene);
                        currentVrm.scene.position.set(0, 0.5, 0);
                        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                        currentVrm.scene.rotation.y = Math.PI;
                    }
                    
                    action.reset().fadeIn(0.5).play();
                    animationActions.push(action);
                    currentAnimationIndex = index;
                    
                    console.log(`Playing animation ${index + 1}/${animationClips.length}: ${animationNames[index] || 'Unnamed'}`);
                    
                    // Set animation to loop
                    action.setLoop(THREE.LoopRepeat);
                    
                    // CRITICAL: Immediate check after playing
                    setTimeout(() => {
                        if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                            console.error("❌ Avatar was removed after starting animation! Re-adding immediately!");
                            scene.add(currentVrm.scene);
                            currentVrm.scene.position.set(0, 0.5, 0);
                            currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                            currentVrm.scene.rotation.y = Math.PI;
                            
                            // Stop the problematic animation
                            if (action && action.isPlaying()) {
                                action.stop();
                                action.reset();
                            }
                            animationActions = animationActions.filter(a => a !== action);
                            
                            console.warn("Animation stopped due to avatar removal. DAE animation may be incompatible with VRM.");
                            alert("⚠️ Animation stopped - DAE format may not be compatible with VRM. Try converting to GLB format.");
                        }
                    }, 50);
                    
                    // CRITICAL: Final check - ensure avatar is still in scene after starting animation
                    if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                        console.error("Avatar was removed after starting animation! Re-adding immediately!");
                        scene.add(currentVrm.scene);
                        currentVrm.scene.position.set(0, 0.5, 0);
                        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                        currentVrm.scene.rotation.y = Math.PI;
                    }
                } else {
                    console.error("Failed to create animation action");
                }
            } catch (actionError) {
                console.error("Error creating animation action:", actionError);
                // Ensure avatar stays in scene even if action creation fails
                if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                    scene.add(currentVrm.scene);
                    currentVrm.scene.position.set(0, 0.5, 0);
                    currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                    currentVrm.scene.rotation.y = Math.PI;
                }
                throw actionError;
            }
        }
    } catch (error) {
        console.error("Error playing animation:", error);
        // Ensure avatar stays in scene
        if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
            scene.add(currentVrm.scene);
        }
    }
}

// Function to cycle through animations automatically
let autoCycleAnimations = false;
let animationCycleInterval = null;

function startAnimationCycle(intervalSeconds = 5) {
    if (animationClips.length <= 1) return;
    
    autoCycleAnimations = true;
    let currentIndex = 0;
    
    // Clear existing interval
    if (animationCycleInterval) {
        clearInterval(animationCycleInterval);
    }
    
    // Cycle through animations
    animationCycleInterval = setInterval(() => {
        if (!isTrackingEnabled && animationClips.length > 0) {
            currentIndex = (currentIndex + 1) % animationClips.length;
            playMixamoAnimation(currentIndex);
        }
    }, intervalSeconds * 1000);
    
    console.log(`Started animation cycle (${intervalSeconds}s per animation)`);
}

function stopAnimationCycle() {
    autoCycleAnimations = false;
    if (animationCycleInterval) {
        clearInterval(animationCycleInterval);
        animationCycleInterval = null;
    }
    console.log("Stopped animation cycle");
}

// Interactive cubes for when tracking is disabled
let interactiveCubes = [];
let selectedCube = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

function createInteractiveCubes() {
    // Remove existing cubes
    interactiveCubes.forEach(cube => scene.remove(cube));
    interactiveCubes = [];
    
    // Create multiple colorful cubes around the model
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    const positions = [
        { x: -2, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
        { x: 0, y: 1, z: -2 },
        { x: 0, y: 1, z: 2 },
        { x: -1.5, y: 2, z: -1.5 },
        { x: 1.5, y: 2, z: 1.5 },
    ];
    
    positions.forEach((pos, index) => {
        const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const material = new THREE.MeshStandardMaterial({ 
            color: colors[index % colors.length],
            emissive: colors[index % colors.length],
            emissiveIntensity: 0.3
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(pos.x, pos.y, pos.z);
        cube.userData.isInteractive = true;
        cube.userData.originalPosition = { ...pos };
        cube.userData.rotationSpeed = {
            x: (Math.random() - 0.5) * 0.02,
            y: (Math.random() - 0.5) * 0.02,
            z: (Math.random() - 0.5) * 0.02
        };
        // Physics properties for hand interaction
        cube.userData.velocity = new THREE.Vector3(0, 0, 0);
        cube.userData.mass = 1;
        cube.userData.damping = 0.9; // Friction
        scene.add(cube);
        interactiveCubes.push(cube);
    });
    
    console.log(`Created ${interactiveCubes.length} interactive cubes`);
}

function removeInteractiveCubes() {
    interactiveCubes.forEach(cube => scene.remove(cube));
    interactiveCubes = [];
    selectedCube = null;
}

// Mouse/touch interaction for cubes
function onMouseDown(event) {
    if (isTrackingEnabled) return; // Don't interact when tracking is active
    
    event.preventDefault();
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update raycaster
    raycaster.setFromCamera(mouse, orbitCamera);
    
    // Check for intersections
    const intersects = raycaster.intersectObjects(interactiveCubes);
    
    if (intersects.length > 0) {
        selectedCube = intersects[0].object;
        selectedCube.userData.isDragging = true;
        
        // Calculate offset
        const intersectPoint = intersects[0].point;
        selectedCube.userData.offset = new THREE.Vector3().subVectors(
            selectedCube.position,
            intersectPoint
        );
    }
}

function onMouseMove(event) {
    if (!selectedCube || !selectedCube.userData.isDragging || isTrackingEnabled) return;
    
    event.preventDefault();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, orbitCamera);
    
    // Create a plane at the cube's Y position
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -selectedCube.position.y);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);
    
    if (intersectPoint) {
        selectedCube.position.copy(intersectPoint).add(selectedCube.userData.offset);
    }
}

function onMouseUp(event) {
    if (selectedCube) {
        selectedCube.userData.isDragging = false;
        selectedCube = null;
    }
}

// Setup cube interaction event listeners (after functions are defined)
function setupCubeInteraction() {
    if (!renderer || !renderer.domElement) return;
    
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mouseleave', onMouseUp);

    // Touch events for mobile
    renderer.domElement.addEventListener('touchstart', (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        onMouseDown(mouseEvent);
    });

    renderer.domElement.addEventListener('touchmove', (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        onMouseMove(mouseEvent);
    });

    renderer.domElement.addEventListener('touchend', (event) => {
        event.preventDefault();
        onMouseUp(event);
    });
}

// Initialize cube interaction after renderer is ready
setupCubeInteraction();

// Load default VRM model
// Use jsDelivr CDN to serve from GitHub (bypasses Vercel LFS issues)
// Format: https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/path/to/file
const vrmUrl = "https://cdn.jsdelivr.net/gh/declared-as-ala/3d-@main/docs/wolf.vrm";
loadVRMModel(vrmUrl);

// Handle file upload
const vrmUploadInput = document.getElementById("vrm-upload");
if (vrmUploadInput) {
    vrmUploadInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.name.toLowerCase().endsWith(".vrm")) {
                console.log("Loading uploaded VRM file:", file.name);
                loadVRMModel(file);
            } else {
                alert("Please upload a .vrm file");
                event.target.value = ""; // Reset input
            }
        }
    });
}

// Helper function to find bone by name in FBX model
function findBoneByName(object, boneName) {
    if (!object) return null;
    
    // Common Mixamo bone name mappings
    const boneNameMap = {
        "Hips": ["mixamorigHips", "Hips", "hip"],
        "Spine": ["mixamorigSpine", "Spine", "spine"],
        "Chest": ["mixamorigSpine1", "Chest", "chest"],
        "Neck": ["mixamorigNeck", "Neck", "neck"],
        "Head": ["mixamorigHead", "Head", "head"],
        "LeftUpperArm": ["mixamorigLeftArm", "LeftUpperArm", "LeftArm"],
        "LeftLowerArm": ["mixamorigLeftForeArm", "LeftLowerArm", "LeftForeArm"],
        "RightUpperArm": ["mixamorigRightArm", "RightUpperArm", "RightArm"],
        "RightLowerArm": ["mixamorigRightForeArm", "RightLowerArm", "RightForeArm"],
        "LeftHand": ["mixamorigLeftHand", "LeftHand"],
        "RightHand": ["mixamorigRightHand", "RightHand"],
        "LeftUpperLeg": ["mixamorigLeftUpLeg", "LeftUpperLeg", "LeftUpLeg"],
        "LeftLowerLeg": ["mixamorigLeftLeg", "LeftLowerLeg", "LeftLeg"],
        "RightUpperLeg": ["mixamorigRightUpLeg", "RightUpperLeg", "RightUpLeg"],
        "RightLowerLeg": ["mixamorigRightLeg", "RightLowerLeg", "RightLeg"],
    };
    
    const searchNames = boneNameMap[boneName] || [boneName];
    
    function searchRecursive(obj) {
        if (!obj) return null;
        
        // Check if this object matches any of the search names
        const objName = obj.name ? obj.name.toLowerCase() : "";
        for (const searchName of searchNames) {
            if (objName.includes(searchName.toLowerCase())) {
                return obj;
            }
        }
        
        // Search in children
        if (obj.children) {
            for (const child of obj.children) {
                const found = searchRecursive(child);
                if (found) return found;
            }
        }
        
        return null;
    }
    
    return searchRecursive(object);
}

// Animate Rotation Helper function (supports both VRM and FBX)
const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    let Part = null;
    
    if (isFBXModel && currentFBXModel) {
        // For FBX models, find bone by name
        Part = findBoneByName(currentFBXModel, name);
    } else if (currentVrm) {
        // For VRM models, use humanoid bone system
        Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    }
    
    if (!Part) {
        return; // Bone not found
    }

    let euler = new THREE.Euler(
        rotation.x * dampener,
        rotation.y * dampener,
        rotation.z * dampener,
        rotation.rotationOrder || "XYZ"
    );
    let quaternion = new THREE.Quaternion().setFromEuler(euler);
    Part.quaternion.slerp(quaternion, lerpAmount); // interpolate
};

// Animate Position Helper Function (supports both VRM and FBX)
const rigPosition = (name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    let Part = null;
    
    if (isFBXModel && currentFBXModel) {
        // For FBX models, find bone by name
        Part = findBoneByName(currentFBXModel, name);
    } else if (currentVrm) {
        // For VRM models, use humanoid bone system
        Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    }
    
    if (!Part) {
        return; // Bone not found
    }
    
    let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
    Part.position.lerp(vector, lerpAmount); // interpolate
};

let oldLookTarget = new THREE.Euler();
const rigFace = (riggedFace) => {
    // Face rigging only works with VRM (blendshapes)
    if (!currentVrm || isFBXModel) {
        return;
    }
    rigRotation("Neck", riggedFace.head, 0.7);

    // Blendshapes and Preset Name Schema
    const Blendshape = currentVrm.blendShapeProxy;
    const PresetName = THREE.VRMSchema.BlendShapePresetName;

    // Simple example without winking. Interpolate based on old blendshape, then stabilize blink with `Kalidokit` helper function.
    // for VRM, 1 is closed, 0 is open.
        // Fix: Ensure eyes stay open by clamping the eye values properly
        const eyeL = clamp(riggedFace.eye.l, 0, 1); // Keep between 0 and 1
        const eyeR = clamp(riggedFace.eye.r, 0, 1);
        
        // Convert to VRM format (1 = closed, 0 = open), but keep eyes mostly open
        const vrmEyeL = lerp(clamp(1 - eyeL, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
        const vrmEyeR = lerp(clamp(1 - eyeR, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
        
        // Stabilize blink to prevent eyes from closing unexpectedly
        const stabilizedEyes = Kalidokit.Face.stabilizeBlink(
            { l: vrmEyeL, r: vrmEyeR },
            riggedFace.head.y
        );
        
        // Ensure eyes don't close completely (keep at least 0.1 open)
        Blendshape.setValue(PresetName.Blink, Math.max(0, Math.min(0.9, stabilizedEyes.l)));

    // Interpolate and set mouth blendshapes
    Blendshape.setValue(PresetName.I, lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), 0.5));
    Blendshape.setValue(PresetName.A, lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), 0.5));
    Blendshape.setValue(PresetName.E, lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), 0.5));
    Blendshape.setValue(PresetName.O, lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), 0.5));
    Blendshape.setValue(PresetName.U, lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), 0.5));

    //PUPILS
    //interpolate pupil and keep a copy of the value
    let lookTarget = new THREE.Euler(
        lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4),
        lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4),
        0,
        "XYZ"
    );
    oldLookTarget.copy(lookTarget);
    currentVrm.lookAt.applyer.lookAt(lookTarget);
};

/* Character Animator (supports both VRM and FBX) */
const animateVRM = (vrm, results) => {
    // Support both VRM and FBX models
    if (!vrm && !currentFBXModel) {
        // If using FBX, check if model is loaded
        if (isFBXModel && !currentFBXModel) {
        return;
        }
        // If using VRM, check if VRM is loaded
        if (!isFBXModel && !currentVrm) {
            return;
        }
    }
    // Take the results from `Holistic` and animate character based on its Face, Pose, and Hand Keypoints.
    let riggedPose, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    // Pose 3D Landmarks are with respect to Hip distance in meters
    const pose3DLandmarks = results.ea;
    // Pose 2D landmarks are with respect to videoWidth and videoHeight
    const pose2DLandmarks = results.poseLandmarks;
    // Be careful, hand landmarks may be reversed
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    // Animate Face (only for VRM - FBX doesn't support blendshapes)
    if (faceLandmarks && !isFBXModel) {
        riggedFace = Kalidokit.Face.solve(faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        rigFace(riggedFace);
    } else if (faceLandmarks && isFBXModel) {
        // For FBX, only animate head rotation (no blendshapes)
        riggedFace = Kalidokit.Face.solve(faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        rigRotation("Neck", riggedFace.head, 0.7);
        rigRotation("Head", riggedFace.head, 0.5);
    }

    // Animate Pose
    if (pose2DLandmarks && pose3DLandmarks) {
        riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        // Stabilize Hips rotation to prevent unwanted tilting
        // Only apply Y rotation (left/right), minimize X and Z tilting
        const stabilizedHipsRotation = {
            x: clamp(riggedPose.Hips.rotation.x * 0.3, -0.2, 0.2), // Reduce X tilt
            y: riggedPose.Hips.rotation.y, // Keep Y rotation
            z: clamp(riggedPose.Hips.rotation.z * 0.3, -0.2, 0.2), // Reduce Z tilt
        };
        rigRotation("Hips", stabilizedHipsRotation, 0.7);
        rigPosition(
            "Hips",
            {
                x: riggedPose.Hips.position.x, // Reverse direction
                y: riggedPose.Hips.position.y + 1, // Add a bit of height
                z: -riggedPose.Hips.position.z, // Reverse direction
            },
            1,
            0.07
        );

        rigRotation("Chest", riggedPose.Spine, 0.25, 0.3);
        rigRotation("Spine", riggedPose.Spine, 0.45, 0.3);

        rigRotation("RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
        rigRotation("RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
        rigRotation("LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
        rigRotation("LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);

        rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, 0.3);
        rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, 0.3);
        rigRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, 0.3);
        rigRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, 0.3);
    }

    // Animate Hands
    let riggedLeftHand = null;
    let riggedRightHand = null;
    
    if (leftHandLandmarks) {
        riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
        if (riggedPose) {
        rigRotation("LeftHand", {
            // Combine pose rotation Z and hand rotation X Y
            z: riggedPose.LeftHand.z,
            y: riggedLeftHand.LeftWrist.y,
            x: riggedLeftHand.LeftWrist.x,
        });
        }
        rigRotation("LeftRingProximal", riggedLeftHand.LeftRingProximal);
        rigRotation("LeftRingIntermediate", riggedLeftHand.LeftRingIntermediate);
        rigRotation("LeftRingDistal", riggedLeftHand.LeftRingDistal);
        rigRotation("LeftIndexProximal", riggedLeftHand.LeftIndexProximal);
        rigRotation("LeftIndexIntermediate", riggedLeftHand.LeftIndexIntermediate);
        rigRotation("LeftIndexDistal", riggedLeftHand.LeftIndexDistal);
        rigRotation("LeftMiddleProximal", riggedLeftHand.LeftMiddleProximal);
        rigRotation("LeftMiddleIntermediate", riggedLeftHand.LeftMiddleIntermediate);
        rigRotation("LeftMiddleDistal", riggedLeftHand.LeftMiddleDistal);
        rigRotation("LeftThumbProximal", riggedLeftHand.LeftThumbProximal);
        rigRotation("LeftThumbIntermediate", riggedLeftHand.LeftThumbIntermediate);
        rigRotation("LeftThumbDistal", riggedLeftHand.LeftThumbDistal);
        rigRotation("LeftLittleProximal", riggedLeftHand.LeftLittleProximal);
        rigRotation("LeftLittleIntermediate", riggedLeftHand.LeftLittleIntermediate);
        rigRotation("LeftLittleDistal", riggedLeftHand.LeftLittleDistal);
    }
    if (rightHandLandmarks) {
        riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
        if (riggedPose) {
        rigRotation("RightHand", {
            // Combine Z axis from pose hand and X/Y axis from hand wrist rotation
            z: riggedPose.RightHand.z,
            y: riggedRightHand.RightWrist.y,
            x: riggedRightHand.RightWrist.x,
        });
        }
    }
    
    // Update hand positions for cube interaction (after both hands are processed)
    updateHandPositions(results, riggedPose, riggedLeftHand, riggedRightHand);
    
    if (rightHandLandmarks) {
        rigRotation("RightRingProximal", riggedRightHand.RightRingProximal);
        rigRotation("RightRingIntermediate", riggedRightHand.RightRingIntermediate);
        rigRotation("RightRingDistal", riggedRightHand.RightRingDistal);
        rigRotation("RightIndexProximal", riggedRightHand.RightIndexProximal);
        rigRotation("RightIndexIntermediate", riggedRightHand.RightIndexIntermediate);
        rigRotation("RightIndexDistal", riggedRightHand.RightIndexDistal);
        rigRotation("RightMiddleProximal", riggedRightHand.RightMiddleProximal);
        rigRotation("RightMiddleIntermediate", riggedRightHand.RightMiddleIntermediate);
        rigRotation("RightMiddleDistal", riggedRightHand.RightMiddleDistal);
        rigRotation("RightThumbProximal", riggedRightHand.RightThumbProximal);
        rigRotation("RightThumbIntermediate", riggedRightHand.RightThumbIntermediate);
        rigRotation("RightThumbDistal", riggedRightHand.RightThumbDistal);
        rigRotation("RightLittleProximal", riggedRightHand.RightLittleProximal);
        rigRotation("RightLittleIntermediate", riggedRightHand.RightLittleIntermediate);
        rigRotation("RightLittleDistal", riggedRightHand.RightLittleDistal);
    }
};

/* SETUP MEDIAPIPE HOLISTIC INSTANCE */
let videoElement = document.querySelector(".input_video"),
    guideCanvas = document.querySelector("canvas.guides");

const onResults = (results) => {
    // Only process if tracking is enabled
    if (!isTrackingEnabled) {
        return;
    }
    
    // Check if we have a model to animate
    if (isFBXModel && !currentFBXModel) {
        return;
    }
    if (!isFBXModel && !currentVrm) {
        return;
    }
    
    // Check if we have valid tracking data
    const hasTracking = results.poseLandmarks && results.poseLandmarks.length > 0;
    
    if (hasTracking) {
        isTrackingActive = true;
        lastTrackingTime = Date.now();
        
        // Stop Mixamo animations if playing
        if (animationActions.length > 0) {
            animationActions.forEach(action => {
                if (action.isPlaying()) {
                    action.fadeOut(0.5);
                    action.stop();
                }
            });
        }
        
        // Stop idle animation if playing (legacy)
        if (idleAnimationAction && idleAnimationAction.isPlaying()) {
            idleAnimationAction.fadeOut(0.5);
            idleAnimationAction.stop();
        }
        
        // Stop animation cycle
        stopAnimationCycle();
        
        // Reset rotation when tracking starts
        if (currentVrm && currentVrm.scene) {
            currentVrm.scene.rotation.y = Math.PI; // Reset to face camera
        }
    } else {
        // Check if tracking has been inactive for too long
        if (isTrackingActive && Date.now() - lastTrackingTime > TRACKING_TIMEOUT) {
            isTrackingActive = false;
            // Start Mixamo idle animation if available
            if (animationClips.length > 0 && animationMixer) {
                playMixamoAnimation(0); // Play first animation
                startAnimationCycle(5); // Cycle every 5 seconds
            } else if (idleAnimationAction && !idleAnimationAction.isPlaying()) {
                // Fallback to legacy idle animation
                idleAnimationAction.reset().fadeIn(0.5).play();
            }
        }
    }
    
    // Draw landmark guides
    drawResults(results);
    // Animate model (only if tracking is active)
    if (isTrackingActive && isTrackingEnabled) {
    animateVRM(currentVrm, results);
    }
};

const holistic = new Holistic({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`;
    },
});

holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
    refineFaceLandmarks: true,
});
// Pass holistic a callback function
holistic.onResults(onResults);

const drawResults = (results) => {
    guideCanvas.width = videoElement.videoWidth;
    guideCanvas.height = videoElement.videoHeight;
    let canvasCtx = guideCanvas.getContext("2d");
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    // Use `Mediapipe` drawing functions
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: "#00cff7",
        lineWidth: 4,
    });
    drawLandmarks(canvasCtx, results.poseLandmarks, {
        color: "#ff0364",
        lineWidth: 2,
    });
    drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
        color: "#C0C0C070",
        lineWidth: 1,
    });
    if (results.faceLandmarks && results.faceLandmarks.length === 478) {
        //draw pupils
        drawLandmarks(canvasCtx, [results.faceLandmarks[468], results.faceLandmarks[468 + 5]], {
            color: "#ffe603",
            lineWidth: 2,
        });
    }
    drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
        color: "#eb1064",
        lineWidth: 5,
    });
    drawLandmarks(canvasCtx, results.leftHandLandmarks, {
        color: "#00cff7",
        lineWidth: 2,
    });
    drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
        color: "#22c3e3",
        lineWidth: 5,
    });
    drawLandmarks(canvasCtx, results.rightHandLandmarks, {
        color: "#ff0364",
        lineWidth: 2,
    });
};

// Animation state
let isTrackingEnabled = false; // User-controlled tracking state
let isTrackingActive = false; // Actual tracking detection state
let idleAnimationMixer = null;
let idleAnimationAction = null;
let lastTrackingTime = 0;
const TRACKING_TIMEOUT = 2000; // 2 seconds without tracking = idle
let camera = null;

// Function to start tracking
function startTracking() {
    if (isTrackingEnabled) return; // Already started
    
    isTrackingEnabled = true;
    isTrackingActive = false;
    
    // Start camera if not already started
    if (!camera) {
        camera = new Camera(videoElement, {
    onFrame: async () => {
                if (isTrackingEnabled) {
        await holistic.send({ image: videoElement });
                }
    },
    width: 640,
    height: 480,
});
camera.start();
    }
    
    // Stop idle animation
    if (currentVrm && currentVrm.scene) {
        currentVrm.scene.rotation.y = Math.PI; // Reset to face camera
    }
    
    // Keep cubes visible but make them interactive with hands
    // Don't remove cubes, just enable hand interaction
    if (interactiveCubes.length === 0 && currentVrm) {
        createInteractiveCubes();
    }
    
    // Update button
    const toggleButton = document.getElementById("tracking-toggle");
    if (toggleButton) {
        toggleButton.textContent = "Stop Tracking";
        toggleButton.style.background = "#e74c3c";
    }
    
    console.log("Tracking started");
}

// Function to stop tracking
function stopTracking() {
    if (!isTrackingEnabled) return; // Already stopped
    
    isTrackingEnabled = false;
    isTrackingActive = false;
    
    // Stop camera
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    // Start idle animation (rotation) and create interactive cubes
    if (currentVrm) {
        createInteractiveCubes();
    }
    
    // Update button
    const toggleButton = document.getElementById("tracking-toggle");
    if (toggleButton) {
        toggleButton.textContent = "Start Tracking";
        toggleButton.style.background = "#13a3f3";
    }
    
    console.log("Tracking stopped - Interactive mode activated");
}

// Hand position tracking for cube interaction
let leftHandWorldPos = null;
let rightHandWorldPos = null;
const HAND_PUSH_DISTANCE = 0.5; // Distance threshold for pushing cubes
const HAND_PUSH_FORCE = 0.3; // Force applied to cubes

// Convert hand position from tracking to world coordinates
function updateHandPositions(results, riggedPose, riggedLeftHand, riggedRightHand) {
    if (!riggedPose) {
        leftHandWorldPos = null;
        rightHandWorldPos = null;
        return;
    }
    
    // Get hand positions relative to hips (from pose)
    // MediaPipe provides hand positions relative to the body
    if (riggedLeftHand && riggedPose.LeftHand) {
        // Convert hand position to world space
        // Left hand position from pose (already in world space relative to hips)
        const handX = riggedPose.LeftHand.x;
        const handY = riggedPose.LeftHand.y + 1; // Add hip height
        const handZ = -riggedPose.LeftHand.z; // Reverse Z
        
        leftHandWorldPos = new THREE.Vector3(handX, handY, handZ);
    } else {
        leftHandWorldPos = null;
    }
    
    if (riggedRightHand && riggedPose.RightHand) {
        // Right hand position from pose
        const handX = riggedPose.RightHand.x;
        const handY = riggedPose.RightHand.y + 1; // Add hip height
        const handZ = -riggedPose.RightHand.z; // Reverse Z
        
        rightHandWorldPos = new THREE.Vector3(handX, handY, handZ);
    } else {
        rightHandWorldPos = null;
    }
}

// Avatar interaction with cubes when tracking is disabled
let avatarPushAnimation = {
    leftArm: { targetRotation: { x: 0, y: 0, z: 0 }, currentRotation: { x: 0, y: 0, z: 0 } },
    rightArm: { targetRotation: { x: 0, y: 0, z: 0 }, currentRotation: { x: 0, y: 0, z: 0 } },
    isPushing: false
};

const AVATAR_PUSH_DISTANCE = 1.2; // Distance threshold for avatar to push cubes (increased)
const AVATAR_PUSH_FORCE = 0.5; // Force applied by avatar (increased)
const AVATAR_ARM_REACH = 0.8; // How far avatar can reach (increased)

function avatarPushCubes(delta) {
    if (!currentVrm || isTrackingEnabled) return; // Only when tracking is disabled
    
    if (interactiveCubes.length === 0) return; // No cubes to interact with
    
    // Get avatar position (center of model, accounting for rotation)
    // Avatar is rotated 180° (Math.PI) to face camera, so forward is -Z
    const avatarPos = new THREE.Vector3(0, 1, 0); // Avatar is at origin, height ~1m
    const avatarForward = new THREE.Vector3(0, 0, -1); // Avatar faces -Z (towards camera)
    
    // Find closest cube near avatar (any direction, but prioritize behind/sides)
    let closestCube = null;
    let closestDistance = Infinity;
    let closestDirection = null;
    let useLeftArm = false;
    let useRightArm = false;
    
    interactiveCubes.forEach(cube => {
        // Calculate relative position from avatar
        const relativePos = new THREE.Vector3().subVectors(cube.position, avatarPos);
        const distance = relativePos.length();
        
        // Check if cube is close enough (any direction - very permissive)
        if (distance < AVATAR_PUSH_DISTANCE && distance > 0.05) {
            const normalizedRel = relativePos.clone().normalize();
            
            // Accept cubes from ANY direction (very permissive)
            // Only exclude cubes that are very far in front (z < -0.5)
            const isVeryFarInFront = relativePos.z < -0.5 && Math.abs(relativePos.x) < 0.2;
            
            // Accept cube if it's not very far in front, or if it's very close
            if (!isVeryFarInFront || distance < AVATAR_PUSH_DISTANCE * 0.5) {
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestCube = cube;
                    closestDirection = normalizedRel;
                    
                    // Determine which arm to use based on cube position
                    // Left side: positive X
                    // Right side: negative X
                    useLeftArm = relativePos.x > 0; // Cube on left side (any positive X)
                    useRightArm = relativePos.x < 0; // Cube on right side (any negative X)
                    
                    // If cube is directly center (x ≈ 0), use right arm by default
                    if (Math.abs(relativePos.x) < 0.1) {
                        useRightArm = true;
                        useLeftArm = false;
                    }
                }
            }
        }
    });
    
    // Animate avatar arms to push the cube
    if (closestCube) {
        avatarPushAnimation.isPushing = true;
        
        // Calculate arm rotation to reach the cube
        const relativePos = new THREE.Vector3().subVectors(closestCube.position, avatarPos);
        const distance = relativePos.length();
        const normalized = relativePos.clone().normalize();
        
        // Calculate angles for arm rotation based on cube position
        // Raise arm based on cube height (Y component)
        const armRaiseAngle = Math.max(0, Math.min(Math.PI * 0.6, Math.asin(Math.max(0, normalized.y))));
        // Side angle (X component determines left/right)
        const armSideAngle = Math.atan2(normalized.x, Math.abs(normalized.z));
        // Forward angle (how much to extend forward)
        const armForwardAngle = Math.max(0, Math.min(Math.PI * 0.4, Math.acos(Math.abs(normalized.z))));
        
        if (useLeftArm) {
            // Left arm: extend to reach cube
            avatarPushAnimation.leftArm.targetRotation = {
                x: armRaiseAngle, // Raise arm based on cube height
                y: Math.max(0, armSideAngle * 0.8), // Extend to left side
                z: -armForwardAngle * 0.3 // Rotate forward slightly
            };
            avatarPushAnimation.rightArm.targetRotation = { x: 0, y: 0, z: 0 }; // Keep right arm at rest
            console.log(`Avatar pushing cube with LEFT arm. Distance: ${distance.toFixed(2)}m, Rotations:`, avatarPushAnimation.leftArm.targetRotation);
        } else if (useRightArm) {
            // Right arm: extend to reach cube
            avatarPushAnimation.rightArm.targetRotation = {
                x: armRaiseAngle, // Raise arm based on cube height
                y: Math.min(0, armSideAngle * 0.8), // Extend to right side
                z: -armForwardAngle * 0.3 // Rotate forward slightly
            };
            avatarPushAnimation.leftArm.targetRotation = { x: 0, y: 0, z: 0 }; // Keep left arm at rest
            console.log(`Avatar pushing cube with RIGHT arm. Distance: ${distance.toFixed(2)}m, Rotations:`, avatarPushAnimation.rightArm.targetRotation);
        }
        
        // Apply force to cube (push away from avatar)
        const pushForce = AVATAR_PUSH_FORCE * (1 - distance / AVATAR_PUSH_DISTANCE);
        const pushDirection = normalized.clone();
        pushDirection.y = 0; // Push horizontally
        pushDirection.normalize();
        
        if (pushDirection.length() > 0) {
            closestCube.userData.velocity.add(pushDirection.multiplyScalar(pushForce * delta * 60));
            closestCube.userData.isBeingPushed = true;
        }
        
        // Reset flag after a short delay
        setTimeout(() => {
            if (closestCube) {
                closestCube.userData.isBeingPushed = false;
            }
        }, 100);
    } else {
        // Return arms to rest position smoothly
        avatarPushAnimation.isPushing = false;
        avatarPushAnimation.leftArm.targetRotation = { x: 0, y: 0, z: 0 };
        avatarPushAnimation.rightArm.targetRotation = { x: 0, y: 0, z: 0 };
    }
    
    // Smoothly animate arm rotations (always apply, even when no cube is close)
    const lerpSpeed = 0.2; // Faster interpolation for more responsive movement
    ['leftArm', 'rightArm'].forEach(arm => {
        const armData = avatarPushAnimation[arm];
        armData.currentRotation.x = lerp(armData.currentRotation.x, armData.targetRotation.x, lerpSpeed);
        armData.currentRotation.y = lerp(armData.currentRotation.y, armData.targetRotation.y, lerpSpeed);
        armData.currentRotation.z = lerp(armData.currentRotation.z, armData.targetRotation.z, lerpSpeed);
        
        // Apply rotation to avatar arms (only when tracking is disabled)
        if (!isTrackingEnabled && currentVrm) {
            if (arm === 'leftArm') {
                // Apply rotation with higher lerp amount for immediate response
                // Use direct quaternion setting for more immediate effect
                rigRotation("LeftUpperArm", {
                    x: armData.currentRotation.x,
                    y: armData.currentRotation.y,
                    z: armData.currentRotation.z
                }, 1, 0.9); // Very high lerp = almost immediate
                rigRotation("LeftLowerArm", {
                    x: armData.currentRotation.x * 0.8,
                    y: armData.currentRotation.y * 0.5,
                    z: armData.currentRotation.z * 0.4
                }, 1, 0.9);
            } else {
                // Apply rotation with higher lerp amount for immediate response
                rigRotation("RightUpperArm", {
                    x: armData.currentRotation.x,
                    y: armData.currentRotation.y,
                    z: armData.currentRotation.z
                }, 1, 0.9); // Very high lerp = almost immediate
                rigRotation("RightLowerArm", {
                    x: armData.currentRotation.x * 0.8,
                    y: armData.currentRotation.y * 0.5,
                    z: armData.currentRotation.z * 0.4
                }, 1, 0.9);
            }
        }
    });
    
    // Apply physics to cubes
    interactiveCubes.forEach(cube => {
        // Apply damping (friction)
        cube.userData.velocity.multiplyScalar(cube.userData.damping);
        
        // Update cube position based on velocity
        cube.position.add(cube.userData.velocity.clone().multiplyScalar(delta));
        
        // Add slight gravity
        cube.userData.velocity.y -= 0.01 * delta * 60;
        
        // Keep cubes above ground
        if (cube.position.y < 0.2) {
            cube.position.y = 0.2;
            cube.userData.velocity.y *= -0.5; // Bounce
        }
        
        // Limit velocity to prevent cubes from flying away
        if (cube.userData.velocity.length() > 0.5) {
            cube.userData.velocity.normalize().multiplyScalar(0.5);
        }
    });
}

// Apply force to cubes when hand is near
function pushCubesWithHands() {
    if (!isTrackingEnabled) return; // Only when tracking is active
    
    interactiveCubes.forEach(cube => {
        let totalForce = new THREE.Vector3(0, 0, 0);
        let hasForce = false;
        
        // Check left hand
        if (leftHandWorldPos) {
            const distance = cube.position.distanceTo(leftHandWorldPos);
            if (distance < HAND_PUSH_DISTANCE && distance > 0.01) {
                const direction = new THREE.Vector3().subVectors(cube.position, leftHandWorldPos).normalize();
                const force = HAND_PUSH_FORCE * (1 - distance / HAND_PUSH_DISTANCE);
                totalForce.add(direction.multiplyScalar(force));
                hasForce = true;
            }
        }
        
        // Check right hand
        if (rightHandWorldPos) {
            const distance = cube.position.distanceTo(rightHandWorldPos);
            if (distance < HAND_PUSH_DISTANCE && distance > 0.01) {
                const direction = new THREE.Vector3().subVectors(cube.position, rightHandWorldPos).normalize();
                const force = HAND_PUSH_FORCE * (1 - distance / HAND_PUSH_DISTANCE);
                totalForce.add(direction.multiplyScalar(force));
                hasForce = true;
            }
        }
        
        // Apply force to cube velocity
        if (hasForce) {
            cube.userData.velocity.add(totalForce);
        }
        
        // Apply damping (friction)
        cube.userData.velocity.multiplyScalar(cube.userData.damping);
        
        // Update cube position based on velocity
        cube.position.add(cube.userData.velocity);
        
        // Add slight gravity
        cube.userData.velocity.y -= 0.01;
        
        // Keep cubes above ground
        if (cube.position.y < 0.2) {
            cube.position.y = 0.2;
            cube.userData.velocity.y *= -0.5; // Bounce
        }
        
        // Limit velocity to prevent cubes from flying away
        if (cube.userData.velocity.length() > 0.5) {
            cube.userData.velocity.normalize().multiplyScalar(0.5);
        }
    });
}

// Setup tracking toggle button (wait for DOM to be ready)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTrackingButton);
} else {
    setupTrackingButton();
}

function setupTrackingButton() {
    const trackingToggleButton = document.getElementById("tracking-toggle");
    if (trackingToggleButton) {
        trackingToggleButton.addEventListener("click", () => {
            if (isTrackingEnabled) {
                stopTracking();
            } else {
                startTracking();
            }
        });
    }
    
}

// Function to load run.fbx animation on Remy
function loadRunAnimation() {
    if (!currentFBXModel || !isFBXModel) {
        alert("Please wait for Remy.fbx to load! (It loads automatically when tracking is disabled)");
        return;
    }
    
    if (typeof THREE.FBXLoader === 'undefined') {
        alert("FBXLoader is not loaded! Please refresh the page.");
        return;
    }
    
    const fbxLoader = new THREE.FBXLoader();
    const runAnimationPath = "animations/run.fbx";
    
    const startButton = document.getElementById("start-animation");
    if (startButton) {
        startButton.textContent = "Loading Animation...";
        startButton.disabled = true;
    }
    
    console.log("Loading run.fbx animation...");
    
    fbxLoader.load(
        runAnimationPath,
        (runAnimation) => {
            try {
                console.log("run.fbx animation loaded");
                
                if (runAnimation.animations && runAnimation.animations.length > 0) {
                    // Clear existing animations
                    animationActions.forEach(action => {
                        if (action && action.isPlaying()) {
                            action.stop();
                            action.reset();
                        }
                    });
                    animationActions = [];
                    animationClips = [];
                    animationNames = [];
                    
                    // Add run animation
                    runAnimation.animations.forEach(clip => {
                        if (clip.tracks && clip.tracks.length > 0) {
                            animationClips.push(clip);
                            animationNames.push(clip.name || "Run");
                            console.log(`✓ Loaded Run animation: ${clip.name || "Run"}`);
                        }
                    });
                    
                    if (animationClips.length > 0) {
                        // Play the run animation
                        setTimeout(() => {
                            try {
                                playMixamoAnimation(0);
                                console.log("Run animation started!");
                                
                                if (startButton) {
                                    startButton.textContent = "Animation Playing!";
                                    startButton.style.background = "#27ae60";
                                    startButton.disabled = false;
                                }
                            } catch (error) {
                                console.error("Error playing run animation:", error);
                                if (startButton) {
                                    startButton.textContent = "Start Animation";
                                    startButton.disabled = false;
                                }
                            }
                        }, 100);
                    } else {
                        console.warn("No valid animations found in run.fbx");
                        if (startButton) {
                            startButton.textContent = "Start Animation";
                            startButton.disabled = false;
                        }
                    }
                } else {
                    console.warn("No animations found in run.fbx");
                    if (startButton) {
                        startButton.textContent = "Start Animation";
                        startButton.disabled = false;
                    }
                }
            } catch (error) {
                console.error("Error processing run.fbx:", error);
                if (startButton) {
                    startButton.textContent = "Start Animation";
                    startButton.disabled = false;
                }
            }
        },
        (progress) => {
            if (progress.total > 0) {
                const percent = (100.0 * progress.loaded / progress.total).toFixed(1);
                console.log(`Loading run.fbx... ${percent}%`);
            }
        },
        (error) => {
            console.error("Error loading run.fbx:", error);
            alert("Failed to load run.fbx animation: " + error.message);
            if (startButton) {
                startButton.textContent = "Start Animation";
                startButton.disabled = false;
            }
        }
    );
}

// OLD FUNCTION - REMOVED: Function to load Dancing.dae animation manually
function loadDancingAnimation_OLD() {
    if (!currentVrm || !currentVrm.scene) {
        alert("Please load a VRM model first!");
        return;
    }
    
    // Ensure avatar is in scene before loading animation
    if (!scene.children.includes(currentVrm.scene)) {
        console.warn("Avatar not in scene! Re-adding before loading animation...");
        scene.add(currentVrm.scene);
        currentVrm.scene.position.set(0, 0.5, 0);
        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
        currentVrm.scene.rotation.y = Math.PI;
    }
    
    // Initialize animation mixer if not already done
    if (!animationMixer && currentVrm && currentVrm.scene) {
        animationMixer = new THREE.AnimationMixer(currentVrm.scene);
        console.log("Animation mixer initialized for Dancing animation");
    }
    
    // Check if ColladaLoader is available
    if (typeof THREE.ColladaLoader === 'undefined') {
        alert("ColladaLoader is not loaded! Please refresh the page.");
        return;
    }
    
    const colladaLoader = new THREE.ColladaLoader();
    const dancingPath = "animations/Dancing.dae";
    
    console.log("Loading Dancing.dae animation...");
    
    const loadButton = document.getElementById("load-dancing");
    if (loadButton) {
        loadButton.textContent = "Loading...";
        loadButton.disabled = true;
    }
    
    colladaLoader.load(
        dancingPath,
        (loaded) => {
            try {
                // CRITICAL: Ensure avatar stays in scene
                if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                    console.warn("Re-adding avatar during animation load");
                    scene.add(currentVrm.scene);
                    currentVrm.scene.position.set(0, 0.5, 0);
                    currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                    currentVrm.scene.rotation.y = Math.PI;
                }
                
                // IMPORTANT: Don't add the DAE model to the scene - we only want animations!
                // The loaded.scene contains a full 3D model that would interfere with the VRM avatar
                // We extract only the animation clips and discard the model
                
                let clips = [];
                
                // Extract animations from DAE file (new API: scene.animations)
                if (loaded.scene && loaded.scene.animations && loaded.scene.animations.length > 0) {
                    clips = loaded.scene.animations;
                    console.log(`Found ${clips.length} animation(s) in DAE scene.animations`);
                } else if (loaded.animations && loaded.animations.length > 0) {
                    clips = loaded.animations;
                    console.log(`Found ${clips.length} animation(s) in DAE animations (deprecated API)`);
                } else {
                    console.warn("No animations found in Dancing.dae");
                    alert("No animations found in Dancing.dae file!");
                    if (loadButton) {
                        loadButton.textContent = "Load Dancing Animation";
                        loadButton.disabled = false;
                    }
                    return;
                }
                
                if (clips.length > 0) {
                    // Clear existing animations
                    animationActions.forEach(action => {
                        if (action && action.isPlaying()) {
                            action.stop();
                            action.reset();
                        }
                    });
                    animationActions = [];
                    animationClips = [];
                    animationNames = [];
                    
                    // Add the dancing animation
                    clips.forEach(clip => {
                        if (clip.tracks && clip.tracks.length > 0) {
                            animationClips.push(clip);
                            animationNames.push(clip.name || "Dancing");
                            console.log(`✓ Loaded Dancing animation: ${clip.name || "Dancing"}`);
                        } else {
                            console.warn("Dancing animation clip has no tracks - skipping");
                        }
                    });
                    
                    if (animationClips.length > 0) {
                        // Stop tracking if active (to play animation)
                        if (isTrackingEnabled) {
                            stopTracking();
                        }
                        
                        // Play the dancing animation with extra safety checks
                        setTimeout(() => {
                            try {
                                // Final check before playing
                                if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                                    console.warn("Re-adding avatar before playing dancing animation");
                                    scene.add(currentVrm.scene);
                                    currentVrm.scene.position.set(0, 0.5, 0);
                                    currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                                    currentVrm.scene.rotation.y = Math.PI;
                                }
                                
                                playMixamoAnimation(0);
                                console.log("Dancing animation started!");
                                
                                // Monitor avatar visibility after animation starts
                                setTimeout(() => {
                                    if (currentVrm && currentVrm.scene && !scene.children.includes(currentVrm.scene)) {
                                        console.error("❌ Avatar disappeared after dancing animation started!");
                                        console.warn("DAE animation is likely incompatible with VRM skeleton");
                                        
                                        // Stop the animation
                                        animationActions.forEach(action => {
                                            if (action && action.isPlaying()) {
                                                action.stop();
                                                action.reset();
                                            }
                                        });
                                        animationActions = [];
                                        
                                        // Re-add avatar
                                        scene.add(currentVrm.scene);
                                        currentVrm.scene.position.set(0, 0.5, 0);
                                        currentVrm.scene.scale.set(0.4, 0.4, 0.4);
                                        currentVrm.scene.rotation.y = Math.PI;
                                        
                                        if (loadButton) {
                                            loadButton.textContent = "Load Dancing Animation";
                                            loadButton.disabled = false;
                                            loadButton.style.background = "";
                                        }
                                        
                                        alert("⚠️ Dancing animation stopped - DAE format is not compatible with VRM.\n\nPlease convert Dancing.dae to GLB format for better compatibility.");
                                    } else {
                                        console.log("✓ Avatar still visible - animation is working!");
                                        if (loadButton) {
                                            loadButton.textContent = "Dancing!";
                                            loadButton.style.background = "#27ae60";
                                        }
                                    }
                                }, 200);
                                
                            } catch (error) {
                                console.error("Error playing dancing animation:", error);
                                alert("Error playing animation. Check console for details.");
                                if (loadButton) {
                                    loadButton.textContent = "Load Dancing Animation";
                                    loadButton.disabled = false;
                                }
                            }
                        }, 100);
                    } else {
                        alert("Failed to load dancing animation - no valid clips found");
                        if (loadButton) {
                            loadButton.textContent = "Load Dancing Animation";
                            loadButton.disabled = false;
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing Dancing.dae:", error);
                alert("Error loading animation: " + error.message);
                if (loadButton) {
                    loadButton.textContent = "Load Dancing Animation";
                    loadButton.disabled = false;
                }
            }
        },
        (progress) => {
            if (progress.total > 0) {
                const percent = (100.0 * progress.loaded / progress.total).toFixed(1);
                console.log(`Loading Dancing.dae... ${percent}%`);
            }
        },
        (error) => {
            console.error("Error loading Dancing.dae:", error);
            alert("Failed to load Dancing.dae: " + error.message);
            if (loadButton) {
                loadButton.textContent = "Load Dancing Animation";
                loadButton.disabled = false;
            }
        }
    );
}

// Function to load Remy.fbx model (and optionally run.fbx animation)
function loadRemyFBX(autoLoadAnimation = false) {
    if (typeof THREE.FBXLoader === 'undefined') {
        alert("FBXLoader is not loaded! Please refresh the page.");
        return;
    }
    
    // Remove existing models
    if (currentVrm && currentVrm.scene) {
        scene.remove(currentVrm.scene);
        currentVrm = null;
    }
    if (currentFBXModel) {
        scene.remove(currentFBXModel);
        currentFBXModel = null;
    }
    
    // Stop any existing animations
    if (animationMixer) {
        animationActions.forEach(action => {
            if (action && action.isPlaying()) {
                action.stop();
                action.reset();
            }
        });
        animationActions = [];
        animationClips = [];
        animationNames = [];
    }
    
    const fbxLoader = new THREE.FBXLoader();
    // Remy.fbx should be in the docs folder or root - try multiple paths
    const remyPath = "../Remy.fbx"; // Try root first
    const runAnimationPath = "animations/run.fbx";
    
    console.log("Loading Remy.fbx model...");
    
    const loadButton = document.getElementById("load-remy");
    if (loadButton) {
        loadButton.textContent = "Loading Remy...";
        loadButton.disabled = true;
    }
    
    // Load Remy model - try multiple possible locations
    function tryLoadRemy(paths, index = 0) {
        if (index >= paths.length) {
            alert("Remy.fbx not found! Please ensure Remy.fbx is in the project root or docs folder.");
            if (loadButton) {
                loadButton.textContent = "Load Remy (FBX)";
                loadButton.disabled = false;
            }
            return;
        }
        
        const currentPath = paths[index];
        console.log(`Trying to load Remy from: ${currentPath}`);
        
        fbxLoader.load(
            currentPath,
            (remyModel) => {
                try {
                    console.log(`✓ Remy.fbx loaded successfully from: ${currentPath}`);
                    
                    // Add Remy to scene
                    scene.add(remyModel);
                    currentFBXModel = remyModel;
                    isFBXModel = true;
                    
                    // Position and scale Remy
                    remyModel.position.set(0, 0, 0);
                    remyModel.scale.set(0.01, 0.01, 0.01); // FBX models are usually in cm, scale down
                    remyModel.rotation.y = Math.PI; // Face camera
                    
                    // Initialize animation mixer for FBX model
                    if (!animationMixer) {
                        animationMixer = new THREE.AnimationMixer(remyModel);
                        console.log("Animation mixer initialized for Remy");
                    } else {
                        // Update mixer root to Remy
                        animationMixer = new THREE.AnimationMixer(remyModel);
                    }
                    
                    // Now load run.fbx animation
                    console.log("Loading run.fbx animation...");
                    fbxLoader.load(
                        runAnimationPath,
                        (runAnimation) => {
                            try {
                                console.log("run.fbx animation loaded");
                                
                                if (runAnimation.animations && runAnimation.animations.length > 0) {
                                    // Clear existing animations
                                    animationClips = [];
                                    animationNames = [];
                                    
                                    // Add run animation
                                    runAnimation.animations.forEach(clip => {
                                        if (clip.tracks && clip.tracks.length > 0) {
                                            animationClips.push(clip);
                                            animationNames.push(clip.name || "Run");
                                            console.log(`✓ Loaded Run animation: ${clip.name || "Run"}`);
                                        }
                                    });
                                    
                                    if (animationClips.length > 0) {
                                        // Stop tracking if active (to play animation)
                                        if (isTrackingEnabled) {
                                            stopTracking();
                                        }
                                        
                                        // Play the run animation
                                        setTimeout(() => {
                                            try {
                                                playMixamoAnimation(0);
                                                console.log("Run animation started!");
                                                
                                                if (loadButton) {
                                                    loadButton.textContent = "Remy Loaded!";
                                                    loadButton.style.background = "#27ae60";
                                                    loadButton.disabled = false;
                                                }
                                            } catch (error) {
                                                console.error("Error playing run animation:", error);
                                                if (loadButton) {
                                                    loadButton.textContent = "Load Remy (FBX)";
                                                    loadButton.disabled = false;
                                                }
                                            }
                                        }, 100);
                                    } else {
                                        console.warn("No valid animations found in run.fbx");
                                        if (loadButton) {
                                            loadButton.textContent = "Load Remy (FBX)";
                                            loadButton.disabled = false;
                                        }
                                    }
                                } else {
                                    console.warn("No animations found in run.fbx");
                                    if (loadButton) {
                                        loadButton.textContent = "Load Remy (FBX)";
                                        loadButton.disabled = false;
                                    }
                                }
                            } catch (error) {
                                console.error("Error processing run.fbx:", error);
                                if (loadButton) {
                                    loadButton.textContent = "Load Remy (FBX)";
                                    loadButton.disabled = false;
                                }
                            }
                        },
                        (progress) => {
                            if (progress.total > 0) {
                                const percent = (100.0 * progress.loaded / progress.total).toFixed(1);
                                console.log(`Loading run.fbx... ${percent}%`);
                            }
                        },
                        (error) => {
                            console.error("Error loading run.fbx:", error);
                            alert("Failed to load run.fbx animation: " + error.message);
                            if (loadButton) {
                                loadButton.textContent = "Load Remy (FBX)";
                                loadButton.disabled = false;
                            }
                        }
                    );
                    
                } catch (error) {
                    console.error("Error processing Remy.fbx:", error);
                    alert("Error loading Remy.fbx: " + error.message);
                    if (loadButton) {
                        loadButton.textContent = "Load Remy (FBX)";
                        loadButton.disabled = false;
                    }
                }
            },
            (progress) => {
                if (progress.total > 0) {
                    const percent = (100.0 * progress.loaded / progress.total).toFixed(1);
                    console.log(`Loading Remy.fbx from ${currentPath}... ${percent}%`);
                }
            },
            (error) => {
                console.error(`Error loading Remy.fbx from ${currentPath}:`, error);
                // Try next path
                tryLoadRemy(paths, index + 1);
            }
        );
    }
    
    // Try multiple possible paths for Remy.fbx
    const remyPaths = [
        "Remy.fbx",      // docs folder (preferred location)
        "./Remy.fbx",    // Current directory
        "../Remy.fbx",   // Root of project (fallback)
    ];
    
    tryLoadRemy(remyPaths);
}
