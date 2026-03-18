// Initialize Lucide Icons
lucide.createIcons();

// Configuration
let map;
let markers = [];

// UI Elements
const btn = document.getElementById('find-btn');
const addPersonBtn = document.getElementById('add-person-btn');
const locationsContainer = document.getElementById('locations-container');
const errorDiv = document.getElementById('error-message');
const uiSheet = document.getElementById('ui-sheet');
const panelToggle = document.getElementById('panel-toggle');

panelToggle.addEventListener('click', () => {
    uiSheet.classList.toggle('collapsed');
});

// State
const PALETTE = ['#0047AB', '#FF6F61', '#118AB2', '#06D6A0', '#AA4465', '#9D4EDD'];
let personCount = 0;

// Add initial 2 persons
function addPersonInput(defaultValue = '') {
    const index = personCount++;
    const color = PALETTE[index % PALETTE.length];
    const letter = String.fromCharCode(65 + index); // A, B, C...

    const wrapper = document.createElement('div');
    wrapper.className = 'relative person-input-wrapper';
    wrapper.innerHTML = `
        <label class="block text-sm font-bold text-[#254b42] mb-2 uppercase tracking-wider flex justify-between">
            Person ${letter} Location
            ${index >= 2 ? `<button class="text-red-500 hover:text-red-700 text-xs font-bold remove-btn" data-index="${index}">REMOVE</button>` : ''}
        </label>
        <div class="relative">
            <i data-lucide="map-pin" class="absolute left-4 top-4 w-6 h-6" style="color: ${color}"></i>
            <input type="text" id="loc${index}" placeholder="e.g. Times Square, NY" class="bauhaus-input location-input"
                value="${defaultValue}" autocomplete="off" data-color="${color}" data-letter="${letter}">
            <div id="suggestions${index}" class="suggestions-list"></div>
        </div>
    `;
    locationsContainer.appendChild(wrapper);
    lucide.createIcons();

    const newEl = document.getElementById(`loc${index}`);
    const newSug = document.getElementById(`suggestions${index}`);
    setupAutocomplete(newEl, newSug);

    if (index >= 2) {
        wrapper.querySelector('.remove-btn').addEventListener('click', () => {
            wrapper.remove();
        });
    }
}

addPersonInput('Empire State Building, NY');
addPersonInput('Washington Square Park, NY');

addPersonBtn.addEventListener('click', () => addPersonInput(''));

async function initMap() {
    try {
        // Fetch base style
        const res = await fetch('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json');
        const styleData = await res.json();

        // Modify layers using exact 1-to-1 Bauhaus mappings scaled from base #86C3B4
        // Original Black (#254b42) -> Darkest Shade (#254b42)
        // Original White (#FFFFFF) -> Lightest Tint (#f0f8f6)
        // Original Light Gray (#EAEAEA) -> Light Tint (#d9ede8)
        // Original Dark Gray (#CCCCCC) -> Mid Tint (#b0dcd1)
        
        styleData.layers.forEach(layer => {
            const id = layer.id.toLowerCase();

            if (!layer.paint) layer.paint = {};

            if (id.includes('water')) {
                if (layer.type === 'fill') layer.paint['fill-color'] = '#254b42'; // Was Black
                if (layer.type === 'line') layer.paint['line-color'] = '#254b42'; // Was Black
            } else if (id.includes('background') || id.includes('landcover')) {
                if (layer.type === 'fill') layer.paint['fill-color'] = '#f0f8f6'; // Was White
            } else if (id.includes('building')) {
                if (layer.type === 'fill') layer.paint['fill-color'] = '#76aa9c'; // Was Dark Gray (Darkened for contrast)
            } else if (id.includes('highway') || id.includes('road')) {
                if (layer.type === 'line') layer.paint['line-color'] = '#254b42'; // Was Black
            } else if (id.includes('park') || id.includes('green')) {
                if (layer.type === 'fill') layer.paint['fill-color'] = '#d9ede8'; // Was Light Gray
            }

            if (layer.type === 'symbol') {
                if (layer.paint['text-color']) layer.paint['text-color'] = '#254b42'; // Was Black
                if (layer.paint['text-halo-color']) layer.paint['text-halo-color'] = '#f0f8f6'; // Was White
                if (layer.paint['text-halo-width']) layer.paint['text-halo-width'] = 2;
            }
        });

        map = new maplibregl.Map({
            container: 'map',
            style: styleData,
            center: [-73.9851, 40.7589], // Default to NYC
            zoom: 12,
            attributionControl: false
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    } catch (err) {
        console.error("Failed to load map style:", err);
        showError("Failed to load map style.");
    }
}

initMap();

function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
    btn.innerHTML = '<span>Find Middle Point</span>';
    btn.disabled = false;
}

function hideError() {
    errorDiv.classList.add('hidden');
}

function clearMap() {
    if (!map) return;

    // Remove all possible dynamic layers
    const style = map.getStyle();
    if (style && style.layers) {
        style.layers.forEach(l => {
            if (
                l.id.startsWith('circle-') ||
                l.id.startsWith('intersection-') ||
                l.id.startsWith('route-line-') ||
                l.id.startsWith('cafes-')
            ) {
                map.removeLayer(l.id);
            }
        });
    }

    const sources = map.getStyle()?.sources;
    if (sources) {
        Object.keys(sources).forEach(s => {
            if (s.startsWith('circle-') || s === 'intersection' || s.startsWith('route-') || s === 'cafes-data') {
                map.removeSource(s);
            }
        });
    }

    // Remove any remaining person-pin HTML markers
    markers.forEach(m => m.remove());
    markers = [];

    const metricsDiv = document.getElementById('results-metrics');
    if (metricsDiv) {
        metricsDiv.classList.add('hidden');
        metricsDiv.classList.remove('flex');
    }
}

// 1. Geocoding (Nominatim)
async function geocode(address) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
    const data = await res.json();
    if (!data || data.length === 0) throw new Error(`Could not find location: ${address}`);
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}

// 1b. Autocomplete (Nominatim)
async function getSuggestions(query) {
    if (!query || query.length < 3) return [];
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
    return await res.json();
}

let debounceTimeout;
function setupAutocomplete(inputEl, suggestionsEl) {
    inputEl.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        const query = e.target.value;
        
        if (query.length < 3) {
            suggestionsEl.style.display = 'none';
            return;
        }

        debounceTimeout = setTimeout(async () => {
            try {
                const results = await getSuggestions(query);
                suggestionsEl.innerHTML = '';
                
                if (results.length > 0) {
                    results.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.textContent = item.display_name;
                        div.addEventListener('click', () => {
                            inputEl.value = item.display_name;
                            suggestionsEl.style.display = 'none';
                        });
                        suggestionsEl.appendChild(div);
                    });
                    suggestionsEl.style.display = 'block';
                } else {
                    suggestionsEl.style.display = 'none';
                }
            } catch (err) {
                console.error("Autocomplete error:", err);
            }
        }, 300); // 300ms debounce
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== inputEl && e.target !== suggestionsEl) {
            suggestionsEl.style.display = 'none';
        }
    });
}

// setupAutocomplete calls... will be handled dynamically 


// 3. Find Venues (Geoapify Places API)
async function findVenues(bbox) {
    const minLon = bbox[0];
    const minLat = bbox[1];
    const maxLon = bbox[2];
    const maxLat = bbox[3];
    
    // Using categories: catering.cafe, catering.restaurant, catering.bar to replace Overpass amenities
    const url = `https://api.geoapify.com/v2/places?categories=catering.cafe,catering.restaurant,catering.bar&filter=rect:${minLon},${minLat},${maxLon},${maxLat}&limit=50&apiKey=b1d0ba2ef4d846ab960edad17da0d2bd`;

    const res = await fetch(url);

    if (!res.ok) throw new Error("Failed to fetch venues. Try again please");
    return await res.json();
}

// 4. Find Isochrones (Geoapify Isolines API)
async function getIsoline(coords, radiusInMeters) {
    const url = `https://api.geoapify.com/v1/isoline?lat=${coords[1]}&lon=${coords[0]}&type=distance&mode=walk&range=${Math.round(radiusInMeters)}&apiKey=b1d0ba2ef4d846ab960edad17da0d2bd`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to calculate isochrones. Location might be unreachable.");
    
    const data = await res.json();
    return data.features[0];
}

// Main Logic
btn.addEventListener('click', async () => {
    if (!map) return;

    const inputs = document.querySelectorAll('.location-input');
    const locationsData = [];
    
    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) {
            locationsData.push({
                address: val,
                color: input.getAttribute('data-color'),
                letter: input.getAttribute('data-letter')
            });
        }
    });


    if (locationsData.length < 2) {
        showError("Please enter at least two locations.");
        return;
    }

    hideError();
    btn.disabled = true;
    btn.innerHTML = '<div class="loader"></div><span>Calculating...</span>';
    clearMap();

    try {
        // Step 1: Geocode
        const bounds = new maplibregl.LngLatBounds();
        
        for (let i = 0; i < locationsData.length; i++) {
            locationsData[i].coords = await geocode(locationsData[i].address);
            bounds.extend(locationsData[i].coords);
            
            const el = document.createElement('div');
            el.className = 'person-marker';
            el.style.backgroundColor = locationsData[i].color;
            markers.push(new maplibregl.Marker({ element: el }).setLngLat(locationsData[i].coords).addTo(map));
        }

        map.fitBounds(bounds, { padding: 100, duration: 1000 });

        let isolines = [];
        let searchArea = null;
        let searchBbox = null;

        // Unified Radius Calculation
        // Measure furthest distance between any two locations to ensure overlap
        let maxPairwiseDist = 0;
        for (let i = 0; i < locationsData.length; i++) {
            for (let j = i + 1; j < locationsData.length; j++) {
                const dist = turf.distance(locationsData[i].coords, locationsData[j].coords, {units: 'kilometers'});
                if (dist > maxPairwiseDist) maxPairwiseDist = dist;
            }
        }
        
        // Initial radius: half the furthest distance + buffer, min 0.5km
        const MAX_RADIUS_KM = 15;
        const MAX_RETRIES = 5;
        const EXPAND_FACTOR = 1.20; // grow by 20% each retry
        let radius = Math.max((maxPairwiseDist / 2) + 0.25, 0.5);

        // Retry loop — expand radius until isolines overlap or cap is hit
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const cappedRadius = Math.min(radius, MAX_RADIUS_KM);

            if (attempt > 1) {
                btn.innerHTML = `<div class="loader"></div><span>Expanding search (${attempt}/${MAX_RETRIES})…</span>`;
                // Remove existing isoline layers/sources before re-rendering
                clearMap();
                // Re-add person markers after clearMap
                for (let i = 0; i < locationsData.length; i++) {
                    const el = document.createElement('div');
                    el.className = 'person-marker';
                    el.style.backgroundColor = locationsData[i].color;
                    markers.push(new maplibregl.Marker({ element: el }).setLngLat(locationsData[i].coords).addTo(map));
                }
            }

            // Fetch all isolines concurrently for this radius
            const isolinePromises = locationsData.map(loc => getIsoline(loc.coords, cappedRadius * 1000));
            isolines = await Promise.all(isolinePromises);

            // Compute intersection recursively
            let candidate = isolines[0];
            for (let i = 1; i < isolines.length; i++) {
                candidate = turf.intersect(candidate, isolines[i]);
                if (!candidate) break;
            }

            if (candidate) {
                searchArea = candidate;
                radius = cappedRadius; // lock in the radius that worked
                break;
            }

            if (cappedRadius >= MAX_RADIUS_KM) break; // already at ceiling
            radius *= EXPAND_FACTOR;
        }

        if (!searchArea) {
            throw new Error("Locations are too far apart to find a shared meeting zone. Try closer locations.");
        }

        // Update UI Metrics with the final radius that achieved overlap
        const walkTime = Math.round((radius / 5) * 60); // 5km/h walking
        const driveTime = Math.round((radius / 30) * 60); // 30km/h driving
        
        document.getElementById('metric-distance').innerText = radius.toFixed(1) + ' km';
        document.getElementById('metric-walking').innerText = walkTime + ' min';
        document.getElementById('metric-driving').innerText = driveTime + ' min';
        
        const metricsContainer = document.getElementById('results-metrics');
        metricsContainer.classList.remove('hidden');
        metricsContainer.classList.add('flex');

        // Render the confirmed isolines
        for (let i = 0; i < isolines.length; i++) {
            const sourceId = `circle-${i}`; // Keep circle ID to maintain `clearMap` compatibility
            const color = locationsData[i].color;
            
            map.addSource(sourceId, { type: 'geojson', data: isolines[i] });
            map.addLayer({
                id: `${sourceId}-fill`,
                type: 'fill',
                source: sourceId,
                paint: { 'fill-color': color, 'fill-opacity': 0.4 }
            });
        }

        // Draw dashed outline of the confirmed intersection zone
        map.addSource('intersection', { type: 'geojson', data: searchArea });
        map.addLayer({
            id: 'intersection-line',
            type: 'line',
            source: 'intersection',
            paint: { 'line-color': '#d9381e', 'line-width': 3, 'line-dasharray': [2, 2] }
        });

        searchBbox = turf.bbox(searchArea);
        
        // If bounding box is incredibly large, the Places API might fail.
        // We'll restrict the area being searched to a max threshold if it is excessive.
        // However, since we define "middle point", if it's large, they are very far.
        const searchAreaSquareKm = turf.area(searchArea) / 1000000;
        if (searchAreaSquareKm > 500) {
            throw new Error("Intersection area is too massive to scan for venues. Please zoom in or choose closer locations.");
        }

        map.fitBounds(searchBbox, { padding: 80, duration: 1000 });

        // Step 4: Find Venues
        const venues = await findVenues(searchBbox);

        // Step 5: Render Venues as native GL layers (60fps, no DOM lag)
        let venuesFound = 0;
        if (venues.features) {
            // Filter only venues that fall inside the intersection polygon
            const inZone = venues.features.filter(f => {
                const lon = f.properties.lon;
                const lat = f.properties.lat;
                if (lon === undefined || lat === undefined) return false;
                return turf.booleanPointInPolygon(turf.point([lon, lat]), searchArea);
            });

            venuesFound = inZone.length;

            if (venuesFound > 0) {
                // Build a clean FeatureCollection with only the properties we need
                const cafesGeoJSON = {
                    type: 'FeatureCollection',
                    features: inZone.map(f => ({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [f.properties.lon, f.properties.lat] },
                        properties: {
                            name: f.properties.name || ('Unnamed ' + (f.properties.categories?.[0]?.split('.').pop() ?? 'venue')),
                            category: f.properties.categories?.[0]?.split('.').pop() ?? 'venue',
                            lon: f.properties.lon,
                            lat: f.properties.lat
                        }
                    }))
                };

                // Feed the whole dataset as a single GPU-managed source
                map.addSource('cafes-data', { type: 'geojson', data: cafesGeoJSON });

                // Shadow layer — slightly larger, dark, offset so it sits below the dot
                map.addLayer({
                    id: 'cafes-shadow',
                    type: 'circle',
                    source: 'cafes-data',
                    paint: {
                        'circle-radius': 9,
                        'circle-color': '#000000',
                        'circle-opacity': 0.20,
                        'circle-translate': [2, 3]   // px offset → fake drop shadow
                    }
                });

                // Main Bauhaus marker — bright yellow with thick black stroke
                map.addLayer({
                    id: 'cafes-marker',
                    type: 'circle',
                    source: 'cafes-data',
                    paint: {
                        'circle-radius': 7,
                        'circle-color': '#F5C518',   // Bauhaus yellow
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#254b42'
                    }
                });

                // Pointer cursor on hover
                map.on('mouseenter', 'cafes-marker', () => { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', 'cafes-marker', () => { map.getCanvas().style.cursor = ''; });

                // Click → popup (replaces the old DOM addEventListener approach)
                map.on('click', 'cafes-marker', (e) => {
                    const props = e.features[0].properties;
                    const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(props.name)}/@${props.lat},${props.lon},17z`;
                    new maplibregl.Popup({ offset: 12, closeButton: false })
                        .setLngLat(e.features[0].geometry.coordinates)
                        .setHTML(`
                            <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer"
                               style="font-size:14px;text-transform:uppercase;color:#000;text-decoration:underline;font-weight:900;display:block;">
                               ${props.name}
                            </a>
                            <div style="font-size:10px;text-transform:uppercase;color:#666;margin-top:2px;">${props.category}</div>`)
                        .addTo(map);
                });
            }
        }

        if (venuesFound === 0) {
            showError("No venues here. Try different locations");
        } else {
            // Hide panel gracefully to reveal map on mobile & desktop
            uiSheet.classList.add('collapsed');
        }

        btn.innerHTML = '<span>Find Middle Point</span>';
        btn.disabled = false;

    } catch (err) {
        console.error(err);
        showError(err.message);
    }
});
