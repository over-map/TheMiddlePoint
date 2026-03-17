# The Middle Point

A modern, Bauhaus-inspired web application designed to find the perfect geographical halfway point between multiple people in a city. It calculates the geometric intersection of walking or driving distances to highlight a shared zone, and then queries the OpenStreetMap Overpass API to locate cafes, restaurants, and bars within that exact common area.

## Features
- **Dynamic User Inputs**: Add multiple participants gracefully. The map calculates intersections seamlessly whether there are 2 people or 10.
- **Unified Radius Calculation**: Automatically scales the maximum permissible driving distance between the furthest participants and caps it at 10km to guarantee efficient search speeds.
- **Dynamic Analytics**: View calculated radius distances alongside real-world walking and driving ETAs directly in the UI panel.
- **Monochromatic Aesthetics**: Features an original `#86C3B4` teal gradient utilizing pure algorithmic contrast mapping from Carto Positron basemaps.
- **Live POI Search**: Deep integration with the Overpass API filters venues precisely within the overlapping bounds of all users.

## Project Structure
To align with professional front-end standards, the project adopts a clean separation of concerns:
- `/index.html`: The core semantic markup and UI skeleton.
- `/src/styles/main.css`: The extracted custom layout and Bauhaus styling logic.
- `/src/scripts/app.js`: The application brain (MapLibre init, DOM events, Overpass + ORS API integrations).

## Tech Stack
- **MapLibre GL JS**: High performance geographic rendering.
- **Turf.js**: Advanced spatial geometry and intersection calculations.
- **Nominatim / OpenStreetMap**: Forward geocoding and live autocomplete suggestions.
- **Overpass API**: Live geographic node and POI querying.
- **Tailwind CSS**: Rapid UI utility styling.
- **Lucide Icons**: Crisp SVG mapping iconography.

## Getting Started
Simply open the `index.html` file in a live-server to use the web-app. Ensure you have an active internet connection to stream the map tiles and hit the routing/geocoding API endpoints.
