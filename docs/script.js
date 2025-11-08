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

    if (currentVrm) {
        // Update model to render physics
        currentVrm.update(clock.getDelta());
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
        // For URLs, ensure proper response type
        loader.load(
            fileOrUrl, 
            onLoad, 
            onProgress, 
            (error) => {
                console.error("Loader error details:", error);
                // Check if it's a 404 or HTML response
                if (error && error.message && error.message.includes("JSON")) {
                    console.error("Possible 404 - file not found or server returned HTML instead of binary");
                }
                onError(error);
            }
        );
    }
}

// Load default VRM model
loadVRMModel("./wolf.vrm");

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
    riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
    riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
    riggedFace.eye = Kalidokit.Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
    Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);

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
    let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

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
    // Draw landmark guides
    drawResults(results);
    // Animate model
    animateVRM(currentVrm, results);
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

// Camera setup - wait for user interaction
let camera = null;
let cameraStarted = false;

function startCamera() {
    if (cameraStarted) {
        return;
    }

    try {
        // Use `Mediapipe` utils to get camera - lower resolution = higher fps
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await holistic.send({ image: videoElement });
            },
            width: 640,
            height: 480,
        });
        
        camera.start()
            .then(() => {
                cameraStarted = true;
                // Hide the start camera button
                const startButton = document.getElementById("start-camera");
                if (startButton) {
                    startButton.classList.add("hidden");
                }
                console.log("Camera started successfully");
            })
            .catch((error) => {
                console.error("Camera error:", error);
                showCameraError(error);
            });
    } catch (error) {
        console.error("Failed to initialize camera:", error);
        showCameraError(error);
    }
}

function showCameraError(error) {
    // Remove existing error message if any
    const existingError = document.querySelector(".camera-error");
    if (existingError) {
        existingError.remove();
    }

    // Create error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "camera-error";
    
    let errorMessage = "Camera access denied. ";
    if (error.name === "NotAllowedError" || error.message?.includes("Permission denied")) {
        errorMessage += "Please allow camera access in your browser settings and click 'Start Camera' again.";
    } else if (error.name === "NotFoundError" || error.message?.includes("not found")) {
        errorMessage += "No camera found. Please connect a camera device.";
    } else {
        errorMessage += "Please check your camera settings and try again.";
    }
    
    errorDiv.textContent = errorMessage;
    document.body.appendChild(errorDiv);

    // Show start button again
    const startButton = document.getElementById("start-camera");
    if (startButton) {
        startButton.classList.remove("hidden");
    }

    // Remove error after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

// Add click handler to start camera button
const startCameraButton = document.getElementById("start-camera");
if (startCameraButton) {
    startCameraButton.addEventListener("click", () => {
        startCamera();
    });
}
