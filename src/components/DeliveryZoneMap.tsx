import { MapContainer, TileLayer, Marker, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface DeliveryZone {
  max_distance_km?: number | null;
  delivery_fee?: number | null;
}

interface DeliveryZoneMapProps {
  center: [number, number];
  zones: DeliveryZone[];
}

const zoneColors = [
  'rgba(59, 130, 246, 0.4)',  // blue-500
  'rgba(16, 185, 129, 0.4)', // emerald-500
  'rgba(239, 68, 68, 0.4)',   // red-500
  'rgba(249, 115, 22, 0.4)',  // orange-500
  'rgba(139, 92, 246, 0.4)',  // violet-500
];

export const DeliveryZoneMap = ({ center, zones }: DeliveryZoneMapProps) => {
  const sortedZones = [...zones].sort((a, b) => (a.max_distance_km || 0) - (b.max_distance_km || 0));

  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} className="h-96 w-full rounded-lg z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center}>
        <Tooltip permanent>Seu Restaurante</Tooltip>
      </Marker>
      {sortedZones.map((zone, index) => {
        if (!zone.max_distance_km || zone.max_distance_km <= 0) return null;
        
        const radiusInMeters = zone.max_distance_km * 1000;
        const color = zoneColors[index % zoneColors.length];

        return (
          <Circle
            key={index}
            center={center}
            radius={radiusInMeters}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 2 }}
          >
            <Tooltip sticky>
              Até {zone.max_distance_km} km <br />
              Taxa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(zone.delivery_fee || 0)}
            </Tooltip>
          </Circle>
        );
      })}
    </MapContainer>
  );
};