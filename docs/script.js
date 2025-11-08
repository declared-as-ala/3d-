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
        // Update model to render physics
        currentVrm.update(delta);
        
        // Update animation mixer if active (for Mixamo animations)
        if (animationMixer) {
            animationMixer.update(delta);
        }
        
        // Update idle animation mixer if active (legacy)
        if (idleAnimationMixer) {
            idleAnimationMixer.update(delta);
        }
        
        // Simple idle rotation when tracking is disabled or not active
        if (!isTrackingEnabled && currentVrm.scene) {
            // Rotate continuously when tracking is disabled
            currentVrm.scene.rotation.y += idleRotationSpeed * delta;
            
            // Avatar interaction with cubes when tracking is disabled
            avatarPushCubes(delta);
            
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
        } else if (isTrackingEnabled && !isTrackingActive && currentVrm.scene) {
            // Rotate when tracking is enabled but no tracking detected (waiting)
            currentVrm.scene.rotation.y += idleRotationSpeed * delta;
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
    // Local files: Use relative paths from docs/ folder (e.g., "animations/run.fbx")
    // URLs: Use full URLs (e.g., "https://cdn.jsdelivr.net/gh/...")
    const animationFiles = [
        // Local FBX file
        "animations/run.fbx",
        
        // You can also add URLs here:
        // "https://cdn.jsdelivr.net/gh/your-username/your-repo@main/animations/idle.glb",
        // "https://cdn.jsdelivr.net/gh/your-username/your-repo@main/animations/wave.glb",
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
    
    // Check if FBXLoader is available
    if (typeof THREE.FBXLoader === 'undefined') {
        console.error("FBXLoader is not loaded! Make sure FBXLoader.js is included in index.html");
        // Fallback: use simple rotation
        if (!isTrackingEnabled) {
            startIdleRotation();
            createInteractiveCubes();
        }
        return;
    }
    
    const gltfLoader = new THREE.GLTFLoader();
    const fbxLoader = new THREE.FBXLoader();
    
    animationFiles.forEach((filePath, index) => {
        console.log(`Loading animation ${index + 1}/${totalAnimationsToLoad}: ${filePath}`);
        
        // Determine file type and use appropriate loader
        const isFBX = filePath.toLowerCase().endsWith('.fbx');
        const isGLB = filePath.toLowerCase().endsWith('.glb') || filePath.toLowerCase().endsWith('.gltf');
        const loader = isFBX ? fbxLoader : gltfLoader;
        
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
                    } else {
                        // GLB/GLTF format: animations are in gltf.animations
                        clips = loaded.animations || [];
                    }
                    
                    if (clips.length > 0) {
                        // Try to retarget animations to VRM skeleton
                        clips.forEach(clip => {
                            try {
                                // Retarget animation to VRM skeleton
                                const retargetedClip = THREE.VRMUtils.retargetAnimation ? 
                                    THREE.VRMUtils.retargetAnimation(clip, vrm) : clip;
                                
                                if (retargetedClip) {
                                    animationClips.push(retargetedClip);
                                    animationNames.push(clip.name || `Animation_${index + 1}`);
                                    console.log(`✓ Loaded animation: ${clip.name || `Animation_${index + 1}`} (${isFBX ? 'FBX' : 'GLB'})`);
                                } else {
                                    // Fallback: use original clip
                                    animationClips.push(clip);
                                    animationNames.push(clip.name || `Animation_${index + 1}`);
                                    console.log(`✓ Loaded animation (no retargeting): ${clip.name || `Animation_${index + 1}`} (${isFBX ? 'FBX' : 'GLB'})`);
                                }
                            } catch (error) {
                                // If retargeting fails, use original clip
                                console.warn(`Retargeting failed for ${clip.name}, using original:`, error);
                                animationClips.push(clip);
                                animationNames.push(clip.name || `Animation_${index + 1}`);
                            }
                        });
                    } else {
                        console.warn(`No animations found in file ${index + 1}: ${filePath}`);
                    }
                } catch (error) {
                    console.error(`Error processing animation file ${index + 1}:`, error);
                }
                
                animationLoadCount++;
                
                // If all animations are loaded and tracking is disabled, play first animation
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
                        if (!isTrackingEnabled) {
                            startIdleRotation();
                            createInteractiveCubes();
                        }
                    }
                }
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
                
                // Continue even if some animations fail
                if (animationLoadCount === totalAnimationsToLoad) {
                    if (animationClips.length > 0) {
                        console.log(`Some animations failed to load, but ${animationClips.length} loaded successfully.`);
                        if (!isTrackingEnabled) {
                            playMixamoAnimation(0);
                        }
                    } else {
                        console.log("No animations loaded. Using simple rotation.");
                        if (!isTrackingEnabled) {
                            startIdleRotation();
                            createInteractiveCubes();
                        }
                    }
                }
            }
        );
    });
}

// Simple idle rotation animation when tracking is off
let idleRotationSpeed = 0.5; // radians per second
function startIdleRotation() {
    // This will be handled in the animate loop
}

// Function to play Mixamo animation
function playMixamoAnimation(index) {
    if (!currentVrm || !animationMixer) {
        console.warn("Cannot play animation: VRM or mixer not initialized");
        return;
    }
    
    if (index < 0 || index >= animationClips.length) {
        console.warn(`Animation index ${index} out of range. Total animations: ${animationClips.length}`);
        return;
    }
    
    // Stop current animation
    animationActions.forEach(action => {
        if (action.isPlaying()) {
            action.fadeOut(0.5);
            action.stop();
        }
    });
    animationActions = []; // Clear array
    
    // Play new animation
    const clip = animationClips[index];
    if (clip && animationMixer) {
        const action = animationMixer.clipAction(clip);
        action.reset().fadeIn(0.5).play();
        animationActions.push(action);
        currentAnimationIndex = index;
        
        console.log(`Playing animation ${index + 1}/${animationClips.length}: ${animationNames[index] || 'Unnamed'}`);
        
        // Set animation to loop
        action.setLoop(THREE.LoopRepeat);
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

// Animate Rotation Helper function
const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentVrm) {
        return;
    }
    const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) {
        return;
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

// Animate Position Helper Function
const rigPosition = (name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentVrm) {
        return;
    }
    const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) {
        return;
    }
    let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
    Part.position.lerp(vector, lerpAmount); // interpolate
};

let oldLookTarget = new THREE.Euler();
const rigFace = (riggedFace) => {
    if (!currentVrm) {
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

/* VRM Character Animator */
const animateVRM = (vrm, results) => {
    if (!vrm) {
        return;
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

    // Animate Face
    if (faceLandmarks) {
        riggedFace = Kalidokit.Face.solve(faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        rigFace(riggedFace);
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
    // Update hand positions for cube interaction (after both hands are processed)
    updateHandPositions(results, riggedPose, riggedLeftHand, riggedRightHand);
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
