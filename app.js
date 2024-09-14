// Color ramp function based on temperature
function getStarColor(temperature) {
    const minTemperature = 2000;   // Coolest stars
    const maxTemperature = 40000;  // Hottest stars

    // Clamp temperature between the defined min and max
    temperature = Math.max(minTemperature, Math.min(maxTemperature, temperature));

    const colorMap = [
        { temp: 2000, color: { r: 255, g: 50, b: 0 } },
        { temp: 3000, color: { r: 255, g: 80, b: 0 } },
        { temp: 4000, color: { r: 255, g: 140, b: 0 } },
        { temp: 5000, color: { r: 255, g: 255, b: 0 } },
        { temp: 6000, color: { r: 255, g: 255, b: 240 } },
        { temp: 8000, color: { r: 255, g: 255, b: 255 } },
        { temp: 10000, color: { r: 201, g: 215, b: 255 } },
        { temp: 12000, color: { r: 100, g: 150, b: 255 } },
        { temp: 20000, color: { r: 64, g: 156, b: 255 } },
        { temp: 30000, color: { r: 0, g: 80, b: 255 } },
        { temp: 40000, color: { r: 0, g: 0, b: 255 } }
    ];

    let lowerColor, upperColor;
    for (let i = 0; i < colorMap.length - 1; i++) {
        if (temperature >= colorMap[i].temp && temperature <= colorMap[i + 1].temp) {
            lowerColor = colorMap[i];
            upperColor = colorMap[i + 1];
            break;
        }
    }

    // If no valid color range is found, return white as a fallback
    if (!lowerColor || !upperColor) {
        return { r: 255, g: 255, b: 255 }; // Default to white
    }

    // Linear interpolation between the two colors
    const t = (temperature - lowerColor.temp) / (upperColor.temp - lowerColor.temp);
    const r = Math.round(lowerColor.color.r + t * (upperColor.color.r - lowerColor.color.r));
    const g = Math.round(lowerColor.color.g + t * (upperColor.color.g - lowerColor.color.g));
    const b = Math.round(lowerColor.color.b + t * (upperColor.color.b - lowerColor.color.b));

    // Return the interpolated RGB object
    return { r, g, b };
}

// Function to scale star size based on luminosity
function scaleStarSize(luminosity) {
    const minSize = 0.02;
    const maxSize = 0.4;
    const minLuminosity = 0.0001;  // Define a lower bound for luminosity scaling
    const maxLuminosity = 30;  // Define an upper bound for luminosity scaling

    // Scale the luminosity between the min and max size
    const scaledSize = Math.max(minSize, Math.min(maxSize, minSize + (maxSize - minSize) * ((luminosity - minLuminosity) / (maxLuminosity - minLuminosity))));
    return scaledSize;
}

let scene, camera, renderer, controls, raycaster, mouse;
let stars = []; // Array to store star meshes for raycasting

function convertRaDecToXYZ(ra, dec, distance) {
    const phi = THREE.Math.degToRad(ra);   // Convert RA to radians
    const theta = THREE.Math.degToRad(90 - dec);  // Convert Dec to radians

    const x = distance * Math.sin(theta) * Math.cos(phi);
    const y = distance * Math.sin(theta) * Math.sin(phi);
    const z = distance * Math.cos(theta);

    return { x, y, z };
}

function generateGlowTexture(starColor) {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    
    // Get the 2D drawing context
    const ctx = canvas.getContext('2d');
    
    // Create radial gradient for the glow effect
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    
    // Define the glow colors, using the star's color
    gradient.addColorStop(0, `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, 1)`);   // Bright center (opaque)
    gradient.addColorStop(0.2, `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, 0.6)`); // Outer glow (semi-transparent)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Fully transparent at the edge
    
    // Fill the canvas with the gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    return texture;
}

function convert24BitToRgba(color24bit, alpha = 1) {
    // Extract the red, green, and blue components from the 24-bit color
    const r = (color24bit >> 16) & 255;  // Red
    const g = (color24bit >> 8) & 255;   // Green
    const b = color24bit & 255;          // Blue

    // Return an rgba() string
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background
    
    // Set up the camera
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 10;  // Initial camera position

    // Set up the renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); // Adjust intensity as needed
    scene.add(ambientLight);

    // Set up OrbitControls with a max distance
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.maxDistance = 18;  // Maximum distance the camera can move along the z-axis
    controls.minDistance = 1;   // Optional: Set minimum distance if you want to prevent zooming too close

    raycaster = new THREE.Raycaster(); // For raycasting
    mouse = new THREE.Vector2(); // To track mouse position

    // Add the Sun at the origin with 'Sun' as the name in userData
    const sunTemperature = 5778;  // The Sun's temperature in Kelvin
    const sunColor = getStarColor(sunTemperature);  // Get the Sun's color based on its temperature
    let sunGeometry = new THREE.SphereGeometry(0.017, 16, 16); // Larger sphere for the Sun
    let sunMaterial = new THREE.MeshBasicMaterial({ color: `rgb(${sunColor.r}, ${sunColor.g}, ${sunColor.b})` });
    let sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(0, 0, 0);  // The Sun is at the origin
    sunMesh.userData = { name: 'Sun', distance: 0 };  // Set Sun's name and distance
    scene.add(sunMesh);
    stars.push(sunMesh); // Add Sun to the stars array for raycasting

    // Load the star data with RA, Dec from the JSON file
    console.log("Loading stars.json...");
    fetch('assets/stars.json')
        .then(response => {
            if (!response.ok) throw new Error("Could not load stars.json");
            return response.json();
        })
        .then(data => {
            console.log("Stars data loaded successfully.");
            const textureLoader = new THREE.TextureLoader();
            const starTexture = textureLoader.load('assets/star_texture.jpg');

            data.forEach(star => {
                const { x, y, z } = convertRaDecToXYZ(star.ra, star.dec, star.distance_pc);
            
                // Scale the size of the star based on its luminosity
                const starSize = scaleStarSize(star.luminosity);
                const starColor = getStarColor(star.estimated_temperature); // Get RGB values
            
                // Generate the glow texture based on the star's color
                const glowTexture = generateGlowTexture(starColor); // Star color as { r, g, b }
            
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: glowTexture,
                    transparent: true,
                    opacity: 1 // Adjust opacity for the glow
                });
            
                let geometry = new THREE.SphereGeometry(starSize, 32, 32); // Star size based on luminosity
            
                let material = new THREE.MeshStandardMaterial({
                    map: starTexture, // Apply the texture
                    color: `rgb(${starColor.r}, ${starColor.g}, ${starColor.b})`, // Star color in RGB format
                    emissive: `rgb(${starColor.r}, ${starColor.g}, ${starColor.b})`, // Emit light from the material
                    emissiveIntensity: 0.2 // Adjust brightness of the emissive effect
                });
            
                let starMesh = new THREE.Mesh(geometry, material);
                starMesh.position.set(x, y, z);
                starMesh.userData = { name: star.name, distance: star.distance_pc };
                stars.push(starMesh); // Add star to array for raycasting
                scene.add(starMesh);
            
                // Add glow sprite
                const glowSprite = new THREE.Sprite(spriteMaterial);
                glowSprite.scale.set(starSize * 6, starSize * 6, 1); // Adjust size relative to the star
                glowSprite.position.set(x, y, z); // Position the glow sprite at the same place as the star
            
                scene.add(glowSprite);
            });
            
        })
        .catch(error => console.error("Error loading stars.json:", error));

    // Add event listener for double-clicks
    window.addEventListener('dblclick', onMouseDoubleClick, false);

    animate();
}


// Double-click event handler
function onMouseDoubleClick(event) {
    console.log("Double-click detected");

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the raycaster with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections between the ray and the stars
    const intersects = raycaster.intersectObjects(stars);

    if (intersects.length > 0) {
        const selectedStar = intersects[0].object;
        console.log("Star selected:", selectedStar.userData.name);
        displayStarInfo(selectedStar.userData); // Display star info
    } else {
        console.log("No star clicked.");
    }
}

// Function to display the selected star's information
function displayStarInfo(starData) {
    console.log("Displaying star info:", starData);

    // Create or update an HTML element to display the data
    let infoBox = document.getElementById('star-info');
    if (!infoBox) {
        infoBox = document.createElement('div');
        infoBox.id = 'star-info';
        infoBox.style.position = 'absolute';
        infoBox.style.top = '20px';
        infoBox.style.right = '20px';
        infoBox.style.padding = '10px';
        infoBox.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        infoBox.style.border = '1px solid black';
        document.body.appendChild(infoBox);
    }

    // Update the infoBox with the selected star's data
    infoBox.innerHTML = `
        <strong>Star:</strong> ${starData.name}<br>
        <strong>Distance:</strong> ${starData.distance === 0 ? 'N/A' : (starData.distance * 3.262).toFixed(2)} light years
    `;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.onload = init;
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
