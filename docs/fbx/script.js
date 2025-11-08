// Ensure fflate is available globally (required for FBXLoader)
// This is handled in index.html, but we check here too
if (typeof window !== 'undefined') {
    // Check if fflate is available
    if (typeof window.fflate === 'undefined' && typeof fflate !== 'undefined') {
        window.fflate = fflate;
    }
}

// Import Kalidokit - use UMD build from CDN (works everywhere)
let Kalidokit;

// Get Kalidokit from CDN (loaded in HTML)
if (typeof window !== 'undefined' && window.Kalidokit) {
    Kalidokit = window.Kalidokit;
} else {
    console.warn("Kalidokit CDN not loaded. Using fallback.");
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
let currentFBXModel = null;
let isFBXModel = true; // Always FBX mode in this page

// renderer
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// camera
const orbitCamera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(0.0, 1.0, 3.0); // Further back to see the model better

// Handle window resize
window.addEventListener("resize", () => {
    orbitCamera.aspect = window.innerWidth / window.innerHeight;
    orbitCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// controls
const orbitControls = new THREE.OrbitControls(orbitCamera, renderer.domElement);
orbitControls.screenSpacePanning = true;
orbitControls.target.set(0.0, 0.5, 0.0); // Lower target to center on model
orbitControls.update();
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;

// scene
const scene = new THREE.Scene();

// Add background image
const textureLoader = new THREE.TextureLoader();
const backgroundTexture = textureLoader.load("../background.jpg", () => {
    scene.background = backgroundTexture;
}, undefined, (error) => {
    console.error("Error loading background image:", error);
    scene.background = new THREE.Color(0x87CEEB);
});

// light
const light = new THREE.DirectionalLight(0xffffff);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Animation system
let animationMixer = null;
let animationActions = [];
let animationClips = [];
let animationNames = [];

// Animation state (must be declared before animate function)
let isTrackingEnabled = false;
let isTrackingActive = false;
let lastTrackingTime = 0;
const TRACKING_TIMEOUT = 2000;
let camera = null;

// Main Render Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Update animation mixer if active
    if (animationMixer && currentFBXModel) {
        try {
            animationMixer.update(delta);
            
            // Check if any actions finished and update button
            const isPlaying = animationActions.some(action => {
                if (!action) return false;
                try {
                    return typeof action.isPlaying === 'function' && action.isPlaying();
                } catch (e) {
                    return false;
                }
            });
            
            const runButton = document.getElementById("run-animation");
            if (runButton && !isPlaying && animationClips.length > 0) {
                // Animation stopped, update button
                if (runButton.textContent === "Stop") {
                    runButton.textContent = "Run";
                    runButton.style.background = "#13a3f3";
                }
            }
        } catch (error) {
            console.error("Error updating animation mixer:", error);
        }
    }

    // Simple idle rotation when tracking is disabled
    if (!isTrackingEnabled && currentFBXModel) {
        currentFBXModel.rotation.y += 0.5 * delta;
    }

    orbitControls.update();
    renderer.render(scene, orbitCamera);
}
animate();

// Helper function to find bone by name in FBX model
// Enhanced with more bone name variations and better search
function findBoneByName(object, boneName) {
    if (!object) return null;
    
    const boneNameMap = {
        "Hips": ["mixamorigHips", "Hips", "hip", "pelvis", "root"],
        "Spine": ["mixamorigSpine", "Spine", "spine", "spine1"],
        "Chest": ["mixamorigSpine1", "Chest", "chest", "spine2", "spine3", "upperchest"],
        "Neck": ["mixamorigNeck", "Neck", "neck"],
        "Head": ["mixamorigHead", "Head", "head"],
        "LeftUpperArm": ["mixamorigLeftArm", "LeftUpperArm", "LeftArm", "leftarm", "l_upperarm"],
        "LeftLowerArm": ["mixamorigLeftForeArm", "LeftLowerArm", "LeftForeArm", "leftforearm", "l_lowerarm", "leftelbow"],
        "RightUpperArm": ["mixamorigRightArm", "RightUpperArm", "RightArm", "rightarm", "r_upperarm"],
        "RightLowerArm": ["mixamorigRightForeArm", "RightLowerArm", "RightForeArm", "rightforearm", "r_lowerarm", "rightelbow"],
        "LeftHand": ["mixamorigLeftHand", "LeftHand", "lefthand", "l_hand", "hand_l", "left_hand", "handleft"],
        "RightHand": ["mixamorigRightHand", "RightHand", "righthand", "r_hand", "hand_r", "right_hand", "handright"],
        "LeftUpperLeg": ["mixamorigLeftUpLeg", "LeftUpperLeg", "LeftUpLeg", "leftupleg", "l_upperleg", "leftthigh"],
        "LeftLowerLeg": ["mixamorigLeftLeg", "LeftLowerLeg", "LeftLeg", "leftleg", "l_lowerleg", "leftshin"],
        "RightUpperLeg": ["mixamorigRightUpLeg", "RightUpperLeg", "RightUpLeg", "rightupleg", "r_upperleg", "rightthigh"],
        "RightLowerLeg": ["mixamorigRightLeg", "RightLowerLeg", "RightLeg", "rightleg", "r_lowerleg", "rightshin"],
        // Hand bones
        "LeftRingProximal": ["mixamorigLeftHandRing1", "LeftRingProximal", "leftring1", "l_ring1"],
        "LeftRingIntermediate": ["mixamorigLeftHandRing2", "LeftRingIntermediate", "leftring2", "l_ring2"],
        "LeftRingDistal": ["mixamorigLeftHandRing3", "LeftRingDistal", "leftring3", "l_ring3"],
        "LeftIndexProximal": ["mixamorigLeftHandIndex1", "LeftIndexProximal", "leftindex1", "l_index1"],
        "LeftIndexIntermediate": ["mixamorigLeftHandIndex2", "LeftIndexIntermediate", "leftindex2", "l_index2"],
        "LeftIndexDistal": ["mixamorigLeftHandIndex3", "LeftIndexDistal", "leftindex3", "l_index3"],
        "LeftMiddleProximal": ["mixamorigLeftHandMiddle1", "LeftMiddleProximal", "leftmiddle1", "l_middle1"],
        "LeftMiddleIntermediate": ["mixamorigLeftHandMiddle2", "LeftMiddleIntermediate", "leftmiddle2", "l_middle2"],
        "LeftMiddleDistal": ["mixamorigLeftHandMiddle3", "LeftMiddleDistal", "leftmiddle3", "l_middle3"],
        "LeftThumbProximal": ["mixamorigLeftHandThumb1", "LeftThumbProximal", "leftthumb1", "l_thumb1"],
        "LeftThumbIntermediate": ["mixamorigLeftHandThumb2", "LeftThumbIntermediate", "leftthumb2", "l_thumb2"],
        "LeftThumbDistal": ["mixamorigLeftHandThumb3", "LeftThumbDistal", "leftthumb3", "l_thumb3"],
        "LeftLittleProximal": ["mixamorigLeftHandPinky1", "LeftLittleProximal", "leftpinky1", "l_pinky1"],
        "LeftLittleIntermediate": ["mixamorigLeftHandPinky2", "LeftLittleIntermediate", "leftpinky2", "l_pinky2"],
        "LeftLittleDistal": ["mixamorigLeftHandPinky3", "LeftLittleDistal", "leftpinky3", "l_pinky3"],
        "RightRingProximal": ["mixamorigRightHandRing1", "RightRingProximal", "rightring1", "r_ring1"],
        "RightRingIntermediate": ["mixamorigRightHandRing2", "RightRingIntermediate", "rightring2", "r_ring2"],
        "RightRingDistal": ["mixamorigRightHandRing3", "RightRingDistal", "rightring3", "r_ring3"],
        "RightIndexProximal": ["mixamorigRightHandIndex1", "RightIndexProximal", "rightindex1", "r_index1"],
        "RightIndexIntermediate": ["mixamorigRightHandIndex2", "RightIndexIntermediate", "rightindex2", "r_index2"],
        "RightIndexDistal": ["mixamorigRightHandIndex3", "RightIndexDistal", "rightindex3", "r_index3"],
        "RightMiddleProximal": ["mixamorigRightHandMiddle1", "RightMiddleProximal", "rightmiddle1", "r_middle1"],
        "RightMiddleIntermediate": ["mixamorigRightHandMiddle2", "RightMiddleIntermediate", "rightmiddle2", "r_middle2"],
        "RightMiddleDistal": ["mixamorigRightHandMiddle3", "RightMiddleDistal", "rightmiddle3", "r_middle3"],
        "RightThumbProximal": ["mixamorigRightHandThumb1", "RightThumbProximal", "rightthumb1", "r_thumb1"],
        "RightThumbIntermediate": ["mixamorigRightHandThumb2", "RightThumbIntermediate", "rightthumb2", "r_thumb2"],
        "RightThumbDistal": ["mixamorigRightHandThumb3", "RightThumbDistal", "rightthumb3", "r_thumb3"],
        "RightLittleProximal": ["mixamorigRightHandPinky1", "RightLittleProximal", "rightpinky1", "r_pinky1"],
        "RightLittleIntermediate": ["mixamorigRightHandPinky2", "RightLittleIntermediate", "rightpinky2", "r_pinky2"],
        "RightLittleDistal": ["mixamorigRightHandPinky3", "RightLittleDistal", "rightpinky3", "r_pinky3"],
    };
    
    const searchNames = boneNameMap[boneName] || [boneName];
    
    function searchRecursive(obj) {
        if (!obj) return null;
        const objName = obj.name ? obj.name.toLowerCase() : "";
        
        // Check if this object matches any of the search names
        for (const searchName of searchNames) {
            const searchLower = searchName.toLowerCase();
            // Exact match or contains match
            if (objName === searchLower || objName.includes(searchLower)) {
                // Prefer bones (THREE.Bone) over regular objects
                if (obj.type === "Bone" || obj.isBone) {
                    return obj;
                }
            }
        }
        
        // Also check if object has a skeleton and search in bones
        if (obj.skeleton && obj.skeleton.bones) {
            for (const bone of obj.skeleton.bones) {
                const boneName = bone.name ? bone.name.toLowerCase() : "";
                for (const searchName of searchNames) {
                    const searchLower = searchName.toLowerCase();
                    if (boneName === searchLower || boneName.includes(searchLower)) {
                        return bone;
                    }
                }
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

// Animate Rotation Helper function - with debug logging
let boneNotFoundWarnings = new Set(); // Track which bones we've warned about
let foundBones = new Set(); // Track which bones we've found
let debugMode = false; // Set to true to enable detailed logging

// Function to list all bones in the model (for debugging)
function listAllBones(object, depth = 0, maxDepth = 5) {
    if (depth > maxDepth) return;
    const indent = "  ".repeat(depth);
    if (object.name) {
        console.log(`${indent}- ${object.name} (${object.type || 'unknown'})`);
    }
    if (object.children) {
        object.children.forEach(child => listAllBones(child, depth + 1, maxDepth));
    }
}

const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentFBXModel) return;
    const Part = findBoneByName(currentFBXModel, name);
    if (!Part) {
        // Only warn once per bone to avoid console spam
        if (!boneNotFoundWarnings.has(name)) {
            console.warn(`⚠️ Bone not found: ${name} - model may not follow tracking correctly`);
            boneNotFoundWarnings.add(name);
            // On first load, list all bones to help debug
            if (boneNotFoundWarnings.size === 1) {
                console.log("📋 Listing all bones in the model (first 3 levels):");
                listAllBones(currentFBXModel, 0, 3);
                // Also try to find skeleton
                if (currentFBXModel.traverse) {
                    currentFBXModel.traverse((obj) => {
                        if (obj.skeleton && obj.skeleton.bones) {
                            console.log(`📋 Found skeleton with ${obj.skeleton.bones.length} bones`);
                            console.log("Bone names:", obj.skeleton.bones.map(b => b.name).slice(0, 20));
                        }
                    });
                }
            }
        }
        return;
    }
    
    // Track found bones
    if (!foundBones.has(name)) {
        foundBones.add(name);
        if (debugMode) {
            console.log(`✓ Found bone: ${name} -> ${Part.name} (type: ${Part.type || 'unknown'})`);
        }
    }

    // Ensure rotation object has x, y, z properties
    // Kalidokit returns rotation objects with x, y, z directly
    const rotX = (rotation.x !== undefined ? rotation.x : 0) * dampener;
    const rotY = (rotation.y !== undefined ? rotation.y : 0) * dampener;
    const rotZ = (rotation.z !== undefined ? rotation.z : 0) * dampener;

    let euler = new THREE.Euler(
        rotX,
        rotY,
        rotZ,
        rotation.rotationOrder || "XYZ"
    );
    let quaternion = new THREE.Quaternion().setFromEuler(euler);
    
    // Apply rotation - works for both Bone objects and regular Object3D
    if (Part.quaternion) {
        Part.quaternion.slerp(quaternion, lerpAmount);
    } else if (Part.rotation) {
        // Fallback for objects without quaternion
        Part.rotation.setFromQuaternion(quaternion);
    }
};

// Animate Position Helper Function
const rigPosition = (name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentFBXModel) return;
    const Part = findBoneByName(currentFBXModel, name);
    if (!Part) return;

    let vector = new THREE.Vector3(position.x * dampener, position.y * dampener, position.z * dampener);
    Part.position.lerp(vector, lerpAmount);
};

// Character Animator - matches VRM behavior exactly
const animateFBX = (results) => {
    if (!currentFBXModel) return;

    let riggedPose, riggedFace;

    const faceLandmarks = results.faceLandmarks;
    // Pose 3D Landmarks are with respect to Hip distance in meters
    const pose3DLandmarks = results.ea;
    // Pose 2D landmarks are with respect to videoWidth and videoHeight
    const pose2DLandmarks = results.poseLandmarks;
    // Be careful, hand landmarks may be reversed
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    // Animate Face (head rotation for FBX - same as VRM)
    if (faceLandmarks) {
        riggedFace = Kalidokit.Face.solve(faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        // Head rotation - FIXED: Invert rotations to match user movements
        // Note: FBX models don't support blendshapes (eye/mouth animation) like VRM
        // Only head rotation can be animated for facial expressions
        if (riggedFace && riggedFace.head) {
            // Invert X and Y rotations to fix inverse movement
            const invertedHead = {
                x: -riggedFace.head.x, // Invert X (left/right)
                y: -riggedFace.head.y, // Invert Y (up/down)
                z: riggedFace.head.z, // Keep Z (rotation order)
                rotationOrder: riggedFace.head.rotationOrder || "XYZ"
            };
            rigRotation("Neck", invertedHead, 0.7, 0.4);
            rigRotation("Head", invertedHead, 0.5, 0.4);
        }
    }

    // Animate Pose - exactly like VRM
    if (pose2DLandmarks && pose3DLandmarks) {
        riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        
        if (!riggedPose) return;
        
        // Stabilize Hips rotation to prevent unwanted tilting - same as VRM
        const stabilizedHipsRotation = {
            x: clamp(riggedPose.Hips.rotation.x * 0.3, -0.2, 0.2), // Reduce X tilt
            y: riggedPose.Hips.rotation.y, // Keep Y rotation
            z: clamp(riggedPose.Hips.rotation.z * 0.3, -0.2, 0.2), // Reduce Z tilt
        };
        rigRotation("Hips", stabilizedHipsRotation, 0.7);
        rigPosition("Hips", {
            x: riggedPose.Hips.position.x, // Reverse direction
            y: riggedPose.Hips.position.y + 1, // Add a bit of height
            z: -riggedPose.Hips.position.z, // Reverse direction
        }, 1, 0.07);

        // Spine - same as VRM
        if (riggedPose.Spine) {
            rigRotation("Chest", riggedPose.Spine, 0.25, 0.3);
            rigRotation("Spine", riggedPose.Spine, 0.45, 0.3);
        }

        // Arms - FIXED: Invert rotations to match user movements
        if (riggedPose.RightUpperArm) {
            const invertedRightUpperArm = {
                x: -riggedPose.RightUpperArm.x,
                y: -riggedPose.RightUpperArm.y,
                z: -riggedPose.RightUpperArm.z,
                rotationOrder: riggedPose.RightUpperArm.rotationOrder || "XYZ"
            };
            rigRotation("RightUpperArm", invertedRightUpperArm, 1, 0.4);
        }
        if (riggedPose.RightLowerArm) {
            const invertedRightLowerArm = {
                x: -riggedPose.RightLowerArm.x,
                y: -riggedPose.RightLowerArm.y,
                z: -riggedPose.RightLowerArm.z,
                rotationOrder: riggedPose.RightLowerArm.rotationOrder || "XYZ"
            };
            rigRotation("RightLowerArm", invertedRightLowerArm, 1, 0.4);
        }
        if (riggedPose.LeftUpperArm) {
            const invertedLeftUpperArm = {
                x: -riggedPose.LeftUpperArm.x,
                y: -riggedPose.LeftUpperArm.y,
                z: -riggedPose.LeftUpperArm.z,
                rotationOrder: riggedPose.LeftUpperArm.rotationOrder || "XYZ"
            };
            rigRotation("LeftUpperArm", invertedLeftUpperArm, 1, 0.4);
        }
        if (riggedPose.LeftLowerArm) {
            const invertedLeftLowerArm = {
                x: -riggedPose.LeftLowerArm.x,
                y: -riggedPose.LeftLowerArm.y,
                z: -riggedPose.LeftLowerArm.z,
                rotationOrder: riggedPose.LeftLowerArm.rotationOrder || "XYZ"
            };
            rigRotation("LeftLowerArm", invertedLeftLowerArm, 1, 0.4);
        }

        // Legs - DISABLED: Keep legs fixed to prevent them from raising
        // The leg bones are not properly mapped or cause unwanted movement
        // if (riggedPose.LeftUpperLeg) rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, 0.3);
        // if (riggedPose.LeftLowerLeg) rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, 0.3);
        // if (riggedPose.RightUpperLeg) rigRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, 0.3);
        // if (riggedPose.RightLowerLeg) rigRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, 0.3);
    }

    // Animate Hands - IMPROVED: More responsive and accurate tracking
    let riggedLeftHand = null;
    let riggedRightHand = null;
    
    if (leftHandLandmarks) {
        riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
        if (riggedPose && riggedLeftHand) {
            // Wrist rotation - FIXED: Invert rotations to match user movements
            rigRotation("LeftHand", {
                // Invert all rotations to fix inverse movement
                z: -riggedPose.LeftHand.z,
                y: -riggedLeftHand.LeftWrist.y,
                x: -riggedLeftHand.LeftWrist.x,
            }, 1, 0.5);
        }
        
        // Finger bones - FIXED: Invert rotations to match user movements
        const invertRotation = (rot) => ({
            x: -rot.x,
            y: -rot.y,
            z: -rot.z,
            rotationOrder: rot.rotationOrder || "XYZ"
        });
        
        if (riggedLeftHand.LeftRingProximal) rigRotation("LeftRingProximal", invertRotation(riggedLeftHand.LeftRingProximal), 1, 0.5);
        if (riggedLeftHand.LeftRingIntermediate) rigRotation("LeftRingIntermediate", invertRotation(riggedLeftHand.LeftRingIntermediate), 1, 0.5);
        if (riggedLeftHand.LeftRingDistal) rigRotation("LeftRingDistal", invertRotation(riggedLeftHand.LeftRingDistal), 1, 0.5);
        if (riggedLeftHand.LeftIndexProximal) rigRotation("LeftIndexProximal", invertRotation(riggedLeftHand.LeftIndexProximal), 1, 0.5);
        if (riggedLeftHand.LeftIndexIntermediate) rigRotation("LeftIndexIntermediate", invertRotation(riggedLeftHand.LeftIndexIntermediate), 1, 0.5);
        if (riggedLeftHand.LeftIndexDistal) rigRotation("LeftIndexDistal", invertRotation(riggedLeftHand.LeftIndexDistal), 1, 0.5);
        if (riggedLeftHand.LeftMiddleProximal) rigRotation("LeftMiddleProximal", invertRotation(riggedLeftHand.LeftMiddleProximal), 1, 0.5);
        if (riggedLeftHand.LeftMiddleIntermediate) rigRotation("LeftMiddleIntermediate", invertRotation(riggedLeftHand.LeftMiddleIntermediate), 1, 0.5);
        if (riggedLeftHand.LeftMiddleDistal) rigRotation("LeftMiddleDistal", invertRotation(riggedLeftHand.LeftMiddleDistal), 1, 0.5);
        if (riggedLeftHand.LeftThumbProximal) rigRotation("LeftThumbProximal", invertRotation(riggedLeftHand.LeftThumbProximal), 1, 0.5);
        if (riggedLeftHand.LeftThumbIntermediate) rigRotation("LeftThumbIntermediate", invertRotation(riggedLeftHand.LeftThumbIntermediate), 1, 0.5);
        if (riggedLeftHand.LeftThumbDistal) rigRotation("LeftThumbDistal", invertRotation(riggedLeftHand.LeftThumbDistal), 1, 0.5);
        if (riggedLeftHand.LeftLittleProximal) rigRotation("LeftLittleProximal", invertRotation(riggedLeftHand.LeftLittleProximal), 1, 0.5);
        if (riggedLeftHand.LeftLittleIntermediate) rigRotation("LeftLittleIntermediate", invertRotation(riggedLeftHand.LeftLittleIntermediate), 1, 0.5);
        if (riggedLeftHand.LeftLittleDistal) rigRotation("LeftLittleDistal", invertRotation(riggedLeftHand.LeftLittleDistal), 1, 0.5);
    }
    if (rightHandLandmarks) {
        riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
        if (riggedPose && riggedRightHand) {
            // Wrist rotation - FIXED: Invert rotations to match user movements
            rigRotation("RightHand", {
                // Invert all rotations to fix inverse movement
                z: -riggedPose.RightHand.z,
                y: -riggedRightHand.RightWrist.y,
                x: -riggedRightHand.RightWrist.x,
            }, 1, 0.5);
        }
        
        // Finger bones - FIXED: Invert rotations to match user movements
        const invertRotation = (rot) => ({
            x: -rot.x,
            y: -rot.y,
            z: -rot.z,
            rotationOrder: rot.rotationOrder || "XYZ"
        });
        
        if (riggedRightHand.RightRingProximal) rigRotation("RightRingProximal", invertRotation(riggedRightHand.RightRingProximal), 1, 0.5);
        if (riggedRightHand.RightRingIntermediate) rigRotation("RightRingIntermediate", invertRotation(riggedRightHand.RightRingIntermediate), 1, 0.5);
        if (riggedRightHand.RightRingDistal) rigRotation("RightRingDistal", invertRotation(riggedRightHand.RightRingDistal), 1, 0.5);
        if (riggedRightHand.RightIndexProximal) rigRotation("RightIndexProximal", invertRotation(riggedRightHand.RightIndexProximal), 1, 0.5);
        if (riggedRightHand.RightIndexIntermediate) rigRotation("RightIndexIntermediate", invertRotation(riggedRightHand.RightIndexIntermediate), 1, 0.5);
        if (riggedRightHand.RightIndexDistal) rigRotation("RightIndexDistal", invertRotation(riggedRightHand.RightIndexDistal), 1, 0.5);
        if (riggedRightHand.RightMiddleProximal) rigRotation("RightMiddleProximal", invertRotation(riggedRightHand.RightMiddleProximal), 1, 0.5);
        if (riggedRightHand.RightMiddleIntermediate) rigRotation("RightMiddleIntermediate", invertRotation(riggedRightHand.RightMiddleIntermediate), 1, 0.5);
        if (riggedRightHand.RightMiddleDistal) rigRotation("RightMiddleDistal", invertRotation(riggedRightHand.RightMiddleDistal), 1, 0.5);
        if (riggedRightHand.RightThumbProximal) rigRotation("RightThumbProximal", invertRotation(riggedRightHand.RightThumbProximal), 1, 0.5);
        if (riggedRightHand.RightThumbIntermediate) rigRotation("RightThumbIntermediate", invertRotation(riggedRightHand.RightThumbIntermediate), 1, 0.5);
        if (riggedRightHand.RightThumbDistal) rigRotation("RightThumbDistal", invertRotation(riggedRightHand.RightThumbDistal), 1, 0.5);
        if (riggedRightHand.RightLittleProximal) rigRotation("RightLittleProximal", invertRotation(riggedRightHand.RightLittleProximal), 1, 0.5);
        if (riggedRightHand.RightLittleIntermediate) rigRotation("RightLittleIntermediate", invertRotation(riggedRightHand.RightLittleIntermediate), 1, 0.5);
        if (riggedRightHand.RightLittleDistal) rigRotation("RightLittleDistal", invertRotation(riggedRightHand.RightLittleDistal), 1, 0.5);
    }
};

/* SETUP MEDIAPIPE HOLISTIC INSTANCE */
let videoElement = document.querySelector(".input_video"),
    guideCanvas = document.querySelector("canvas.guides");

const onResults = (results) => {
    if (!isTrackingEnabled) return;
    if (!currentFBXModel) return;
    
    const hasTracking = results.poseLandmarks && results.poseLandmarks.length > 0;
    
    if (hasTracking) {
        isTrackingActive = true;
        lastTrackingTime = Date.now();
        
        // Stop animations if playing
        if (animationActions.length > 0) {
            animationActions.forEach(action => {
                if (action && typeof action.isPlaying === 'function' && action.isPlaying()) {
                    action.fadeOut(0.5);
                    action.stop();
                }
            });
            // Update button when tracking stops animation
            const runButton = document.getElementById("run-animation");
            if (runButton && animationClips.length > 0) {
                runButton.textContent = "Run";
                runButton.style.background = "#13a3f3";
            }
        }
        
        // Reset rotation when tracking starts
        if (currentFBXModel) {
            currentFBXModel.rotation.y = Math.PI;
        }
    } else {
        if (isTrackingActive && Date.now() - lastTrackingTime > TRACKING_TIMEOUT) {
            isTrackingActive = false;
        }
    }
    
    drawResults(results);
    if (isTrackingActive && isTrackingEnabled && currentFBXModel) {
        try {
            animateFBX(results);
        } catch (error) {
            console.error("Error in animateFBX:", error);
        }
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

holistic.onResults(onResults);

const drawResults = (results) => {
    guideCanvas.width = videoElement.videoWidth;
    guideCanvas.height = videoElement.videoHeight;
    let canvasCtx = guideCanvas.getContext("2d");
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    
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


// Function to start tracking
function startTracking() {
    if (isTrackingEnabled) return;
    
    isTrackingEnabled = true;
    isTrackingActive = false;
    
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
    
    if (currentFBXModel) {
        currentFBXModel.rotation.y = Math.PI;
    }
    
    const toggleButton = document.getElementById("tracking-toggle");
    if (toggleButton) {
        toggleButton.textContent = "Stop Tracking";
        toggleButton.style.background = "#e74c3c";
    }
    
    console.log("Tracking started");
}

// Function to stop tracking
function stopTracking() {
    if (!isTrackingEnabled) return;
    
    isTrackingEnabled = false;
    isTrackingActive = false;
    
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    const toggleButton = document.getElementById("tracking-toggle");
    if (toggleButton) {
        toggleButton.textContent = "Start Tracking";
        toggleButton.style.background = "#13a3f3";
    }
    
    console.log("Tracking stopped");
}

// Function to play animation
function playMixamoAnimation(index) {
    if (!currentFBXModel) {
        console.error("Cannot play animation: FBX model not loaded");
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
            if (action && typeof action.isPlaying === 'function' && action.isPlaying()) {
                action.fadeOut(0.5);
                action.stop();
            }
        });
        animationActions = [];
        
        // Play new animation
        const clip = animationClips[index];
        if (clip && animationMixer) {
            const action = animationMixer.clipAction(clip);
            if (action) {
                action.reset().fadeIn(0.5).play();
                animationActions.push(action);
                action.setLoop(THREE.LoopRepeat);
                console.log(`Playing animation: ${animationNames[index] || 'Unnamed'}`);
                
                // Update button to show "Stop" when animation is playing
                // Update immediately and also with setTimeout as backup
                const runButton = document.getElementById("run-animation");
                if (runButton) {
                    runButton.textContent = "Stop";
                    runButton.style.background = "#e74c3c";
                    console.log("Button updated to Stop (immediate)");
                } else {
                    console.error("Run button not found!");
                }
                
                // Also update with setTimeout as backup
                setTimeout(() => {
                    const runButton2 = document.getElementById("run-animation");
                    if (runButton2 && runButton2.textContent !== "Stop") {
                        runButton2.textContent = "Stop";
                        runButton2.style.background = "#e74c3c";
                        console.log("Button updated to Stop (backup)");
                    }
                }, 100);
            } else {
                console.error("Failed to create animation action");
            }
        } else {
            console.error("Clip or mixer not available");
        }
    } catch (error) {
        console.error("Error playing animation:", error);
    }
}

// Function to stop animation
function stopMixamoAnimation() {
    try {
        console.log("stopMixamoAnimation called. Actions count:", animationActions.length);
        
        // Stop all animations immediately
        animationActions.forEach((action, index) => {
            if (action) {
                try {
                    console.log(`Stopping action ${index}...`);
                    if (typeof action.isPlaying === 'function' && action.isPlaying()) {
                        action.fadeOut(0.1); // Faster fade
                        action.stop();
                        console.log(`Action ${index} stopped`);
                    } else {
                        // Force stop even if isPlaying doesn't work
                        action.stop();
                        action.reset();
                        console.log(`Action ${index} force stopped`);
                    }
                    action.reset();
                } catch (e) {
                    console.warn(`Error stopping action ${index}:`, e);
                    // Try to stop anyway
                    try {
                        action.stop();
                        action.reset();
                    } catch (e2) {
                        console.error(`Failed to force stop action ${index}:`, e2);
                    }
                }
            }
        });
        animationActions = [];
        
        // Restore initial position and rotation
        if (currentFBXModel && currentFBXModel.userData.initialPosition) {
            currentFBXModel.position.copy(currentFBXModel.userData.initialPosition);
            if (currentFBXModel.userData.initialRotationY !== undefined) {
                currentFBXModel.rotation.set(0, currentFBXModel.userData.initialRotationY, 0);
            }
            console.log("Model restored to initial position");
        }
        
        // Update button to show "Run" when animation is stopped
        // Update immediately and also with setTimeout as backup
        const runButton = document.getElementById("run-animation");
        if (runButton) {
            runButton.textContent = "Run";
            runButton.style.background = "#13a3f3";
            console.log("Button updated to Run (immediate)");
        } else {
            console.error("Run button not found when trying to stop!");
        }
        
        // Also update with setTimeout as backup
        setTimeout(() => {
            const runButton2 = document.getElementById("run-animation");
            if (runButton2 && runButton2.textContent !== "Run") {
                runButton2.textContent = "Run";
                runButton2.style.background = "#13a3f3";
                console.log("Button updated to Run (backup)");
            }
        }, 100);
        
        console.log("Animation stopped");
    } catch (error) {
        console.error("Error stopping animation:", error);
    }
}

// Function to load Remy.fbx
function loadRemyFBX() {
    if (typeof THREE.FBXLoader === 'undefined') {
        alert("FBXLoader is not loaded! Please refresh the page.");
        return;
    }
    
    // Check if fflate is available before using FBXLoader
    // Wait a bit for fflate to be exposed (in case it's still loading)
    var fflateCheckAttempts = 0;
    var maxFflateChecks = 20; // 1 second
    
    function checkFflate() {
        fflateCheckAttempts++;
        
        // Check if fflate is available
        if (typeof window !== 'undefined' && window.fflate) {
            console.log('✓ fflate is available');
            return true;
        }
        if (typeof fflate !== 'undefined') {
            window.fflate = fflate;
            console.log('✓ fflate found and exposed');
            return true;
        }
        
        if (fflateCheckAttempts >= maxFflateChecks) {
            console.error("✗ fflate is not available after waiting! FBXLoader requires fflate to be loaded.");
            alert("Error: fflate library is not loaded. Please refresh the page and wait a moment for libraries to load.");
            return false;
        }
        
        return false;
    }
    
    // Check immediately
    if (!checkFflate()) {
        // Wait a bit and check again (fflate might still be loading)
        var fflateWaitInterval = setInterval(function() {
            if (checkFflate()) {
                clearInterval(fflateWaitInterval);
                continueLoading();
            }
            if (fflateCheckAttempts >= maxFflateChecks) {
                clearInterval(fflateWaitInterval);
            }
        }, 50);
        return; // Exit early, continueLoading will be called when fflate is ready
    }
    
    function continueLoading() {
        const fbxLoader = new THREE.FBXLoader();
    
    // Try multiple paths for Remy.fbx
    // Note: When served from /fbx/, paths are relative to the served directory
    const remyPaths = [
        "../Remy.fbx",   // From docs/fbx/ to docs/ (preferred - should work)
        "/Remy.fbx",     // Absolute path from root
        "./Remy.fbx",    // Current directory (docs/fbx/)
        "Remy.fbx",      // docs folder
    ];
    
    function tryLoadRemy(paths, index = 0) {
        if (index >= paths.length) {
            console.error("Remy.fbx not found in any of the tried paths");
            alert("Remy.fbx not found! Please ensure Remy.fbx is in the docs folder.");
            return;
        }
        
        const currentPath = paths[index];
        console.log(`Trying to load Remy from: ${currentPath}`);
        
        fbxLoader.load(
            currentPath,
            (remyModel) => {
                try {
                    console.log(`✓ Remy.fbx loaded successfully from: ${currentPath}`);
                    
                    // Remove existing model if any
                    if (currentFBXModel) {
                        scene.remove(currentFBXModel);
                    }
                    
                    // Reset bone tracking
                    boneNotFoundWarnings.clear();
                    foundBones.clear();
                    
                    // Add Remy to scene
                    scene.add(remyModel);
                    currentFBXModel = remyModel;
                    
                    // List all bones for debugging (first time only)
                    console.log("📋 Model bones structure (first 3 levels):");
                    listAllBones(remyModel, 0, 3);
                    
                    // Position and scale Remy - adjust to be centered and visible
                    // Calculate bounding box to center the model
                    const box = new THREE.Box3().setFromObject(remyModel);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    // Calculate appropriate scale (target height ~1.5 units)
                    const targetHeight = 1.5;
                    const scale = targetHeight / size.y;
                    
                    remyModel.scale.set(scale, scale, scale);
                    
                    // Center the model
                    const initialPosition = new THREE.Vector3(-center.x * scale, -center.y * scale + 0.5, -center.z * scale);
                    const initialRotationY = Math.PI; // Face camera
                    const initialScale = new THREE.Vector3(scale, scale, scale);
                    
                    remyModel.position.copy(initialPosition);
                    remyModel.rotation.set(0, initialRotationY, 0); // Set rotation directly
                    
                    // Store initial transform for restoration
                    remyModel.userData.initialPosition = initialPosition.clone();
                    remyModel.userData.initialRotationY = initialRotationY;
                    remyModel.userData.initialScale = initialScale.clone();
                    
                    console.log(`Model scaled to ${scale.toFixed(3)}, centered at (${remyModel.position.x.toFixed(2)}, ${remyModel.position.y.toFixed(2)}, ${remyModel.position.z.toFixed(2)})`);
                    
                    // Initialize animation mixer
                    animationMixer = new THREE.AnimationMixer(remyModel);
                    console.log("Animation mixer initialized for Remy");
                    
                    // Debug: List all bones in the model for troubleshooting
                    function listAllBones(obj, depth = 0) {
                        if (depth > 10) return; // Limit depth
                        if (obj && obj.name) {
                            console.log("  ".repeat(depth) + "- " + obj.name + (obj.isBone ? " (BONE)" : ""));
                        }
                        if (obj && obj.children) {
                            obj.children.forEach(child => listAllBones(child, depth + 1));
                        }
                    }
                    console.log("=== FBX Model Bones ===");
                    listAllBones(remyModel);
                    console.log("======================");
                    
                    // Show Run button now that Remy is loaded
                    const runButton = document.getElementById("run-animation");
                    if (runButton) {
                        runButton.style.display = "inline-block";
                        runButton.disabled = false;
                    }
                    
                    console.log("Remy.fbx loaded successfully!");
                } catch (error) {
                    console.error("Error processing Remy.fbx:", error);
                    alert("Error loading Remy.fbx: " + error.message);
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
    
        tryLoadRemy(remyPaths);
    }
    
    // Start loading immediately if fflate is already available
    continueLoading();
}

// Function to load run.fbx animation
function loadRunAnimation() {
    if (!currentFBXModel) {
        alert("Please wait for Remy.fbx to load first!");
        return;
    }
    
    if (typeof THREE.FBXLoader === 'undefined') {
        alert("FBXLoader is not loaded! Please refresh the page.");
        return;
    }
    
    const fbxLoader = new THREE.FBXLoader();
    const runAnimationPath = "../animations/run.fbx";
    
    const runButton = document.getElementById("run-animation");
    if (runButton) {
        runButton.textContent = "Loading...";
        runButton.disabled = true;
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
                        if (action && typeof action.isPlaying === 'function' && action.isPlaying()) {
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
                        // Stop tracking if active (to play animation)
                        if (isTrackingEnabled) {
                            stopTracking();
                        }
                        
                        // Play the run animation
                        setTimeout(() => {
                            try {
                                playMixamoAnimation(0);
                                console.log("Run animation started!");
                                
                                // Button will be updated by playMixamoAnimation, but ensure it's set here too
                                // Update immediately
                                if (runButton) {
                                    runButton.textContent = "Stop";
                                    runButton.style.background = "#e74c3c";
                                    runButton.disabled = false;
                                    console.log("Button set to Stop in loadRunAnimation (immediate)");
                                }
                                
                                // Also update with setTimeout as backup
                                setTimeout(() => {
                                    if (runButton && runButton.textContent !== "Stop") {
                                        runButton.textContent = "Stop";
                                        runButton.style.background = "#e74c3c";
                                        runButton.disabled = false;
                                        console.log("Button set to Stop in loadRunAnimation (backup)");
                                    }
                                }, 150);
                            } catch (error) {
                                console.error("Error playing run animation:", error);
                                if (runButton) {
                                    runButton.textContent = "Run";
                                    runButton.style.background = "#13a3f3";
                                    runButton.disabled = false;
                                }
                            }
                        }, 100);
                    } else {
                        console.warn("No valid animations found in run.fbx");
                        if (runButton) {
                            runButton.textContent = "Run";
                            runButton.disabled = false;
                        }
                    }
                } else {
                    console.warn("No animations found in run.fbx");
                    if (runButton) {
                        runButton.textContent = "Run";
                        runButton.disabled = false;
                    }
                }
            } catch (error) {
                console.error("Error processing run.fbx:", error);
                if (runButton) {
                    runButton.textContent = "Run";
                    runButton.disabled = false;
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
            if (runButton) {
                runButton.textContent = "Run";
                runButton.disabled = false;
            }
        }
    );
}

// Setup buttons
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupButtons);
} else {
    setupButtons();
}

function setupButtons() {
    // Setup tracking toggle button
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
    
    // Setup run animation button
    const runButton = document.getElementById("run-animation");
    if (runButton) {
        runButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Check button text first (more reliable)
            const buttonText = runButton.textContent.trim();
            console.log("Run button clicked. Button text:", buttonText);
            
            // Check if animation is currently playing
            const isPlaying = animationActions.some(action => {
                if (!action) return false;
                try {
                    return typeof action.isPlaying === 'function' && action.isPlaying();
                } catch (e) {
                    return false;
                }
            });
            
            console.log("Is playing (from actions):", isPlaying);
            
            // Use button text as primary indicator, actions as secondary
            if (buttonText === "Stop" || isPlaying) {
                // Stop animation if playing
                console.log("Stopping animation...");
                stopMixamoAnimation();
            } else {
                // Load and play animation if not playing
                if (animationClips.length > 0) {
                    // Animation already loaded, just play it
                    console.log("Playing existing animation...");
                    playMixamoAnimation(0);
                } else {
                    // Need to load animation first
                    console.log("Loading animation...");
                    loadRunAnimation();
                }
            }
        });
    } else {
        console.error("Run button not found in DOM!");
    }
}

// Load Remy.fbx automatically when page loads
loadRemyFBX();

