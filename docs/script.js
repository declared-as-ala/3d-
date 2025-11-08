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
        
        // Update idle animation mixer if active
        if (idleAnimationMixer) {
            idleAnimationMixer.update(delta);
        }
        
        // Simple idle rotation when tracking is disabled or not active
        if (!isTrackingEnabled && currentVrm.scene) {
            // Rotate continuously when tracking is disabled
            currentVrm.scene.rotation.y += idleRotationSpeed * delta;
            
            // Animate interactive cubes
            interactiveCubes.forEach(cube => {
                if (!cube.userData.isDragging) {
                    cube.rotation.x += cube.userData.rotationSpeed.x;
                    cube.rotation.y += cube.userData.rotationSpeed.y;
                    cube.rotation.z += cube.userData.rotationSpeed.z;
                    
                    // Float animation
                    cube.position.y = cube.userData.originalPosition.y + Math.sin(Date.now() * 0.001 + cube.userData.originalPosition.x) * 0.2;
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

// Function to load idle animations (Mixamo format)
function loadIdleAnimation(vrm) {
    console.log("Loading Mixamo animations...");
    
    // Example Mixamo animation URLs - replace with your own Mixamo animations
    // Mixamo animations are in GLB format with embedded animations
    const animationUrls = [
        // You can add multiple Mixamo animation URLs here
        // Example: "https://your-cdn.com/animations/idle.glb",
        // Example: "https://your-cdn.com/animations/wave.glb",
        // Example: "https://your-cdn.com/animations/dance.glb",
    ];
    
    // For now, we'll use simple rotation and add interactive cubes
    // When you have Mixamo animations, uncomment and use the code below
    
    /*
    const loader = new THREE.GLTFLoader();
    animationUrls.forEach((url, index) => {
        loader.load(url, (gltf) => {
            const clips = gltf.animations;
            if (clips && clips.length > 0) {
                animationClips.push(...clips);
                console.log(`Loaded animation ${index + 1}: ${clips[0].name}`);
            }
        });
    });
    */
    
    // Start with simple rotation animation
    if (!isTrackingEnabled) {
        startIdleRotation();
        createInteractiveCubes();
    }
}

// Simple idle rotation animation when tracking is off
let idleRotationSpeed = 0.5; // radians per second
function startIdleRotation() {
    // This will be handled in the animate loop
}

// Function to play Mixamo animation
function playMixamoAnimation(index) {
    if (!currentVrm || !animationMixer) return;
    
    // Stop current animation
    animationActions.forEach(action => {
        if (action.isPlaying()) {
            action.fadeOut(0.5);
            action.stop();
        }
    });
    
    // Play new animation
    if (animationClips[index] && animationMixer) {
        const action = animationMixer.clipAction(animationClips[index]);
        action.reset().fadeIn(0.5).play();
        animationActions.push(action);
        currentAnimationIndex = index;
    }
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
        
        // Stop idle animation if playing
        if (idleAnimationAction && idleAnimationAction.isPlaying()) {
            idleAnimationAction.fadeOut(0.5);
            idleAnimationAction.stop();
        }
        
        // Reset rotation when tracking starts
        if (currentVrm && currentVrm.scene) {
            currentVrm.scene.rotation.y = Math.PI; // Reset to face camera
        }
    } else {
        // Check if tracking has been inactive for too long
        if (isTrackingActive && Date.now() - lastTrackingTime > TRACKING_TIMEOUT) {
            isTrackingActive = false;
            // Start idle animation
            if (idleAnimationAction && !idleAnimationAction.isPlaying()) {
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
