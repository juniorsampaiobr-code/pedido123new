import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { Tables } from '@/integrations/supabase/types';

// Corrige um problema comum com o ícone do marcador em bundlers como o Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

type DeliveryZone = Tables<'delivery_zones'>;

interface DeliveryZoneEditorMapProps {
  restaurantCenter: [number, number];
  zones: DeliveryZone[];
  onNewZoneCenter: (lat: number, lng: number) => void;
}

const zoneColors = [
  'rgba(59, 130, 246, 0.4)',  // blue-500
  'rgba(16, 185, 129, 0.4)', // emerald-500
  'rgba(239, 68, 68, 0.4)',   // red-500
  'rgba(249, 115, 22, 0.4)',  // orange-500
  'rgba(139, 92, 246, 0.4)',  // violet-500
];

// Componente para lidar com cliques no mapa
const MapClickHandler = ({ onNewZoneCenter }: { onNewZoneCenter: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onNewZoneCenter(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const DeliveryZoneEditorMap = ({ restaurantCenter, zones, onNewZoneCenter }: DeliveryZoneEditorMapProps) => {
  const sortedZones = [...zones].sort((a, b) => (a.max_distance_km || 0) - (b.max_distance_km || 0));
  const [mapCenter, setMapCenter] = useState(restaurantCenter);

  useEffect(() => {
    if (restaurantCenter[0] !== 0 || restaurantCenter[1] !== 0) {
      setMapCenter(restaurantCenter);
    }
  }, [restaurantCenter]);

  return (
    <MapContainer center={mapCenter} zoom={14} scrollWheelZoom={false} className="h-96 w-full rounded-lg z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {/* Marcador do Restaurante */}
      {(restaurantCenter[0] !== 0 || restaurantCenter[1] !== 0) && (
        <Marker position={restaurantCenter}>
          <Tooltip permanent>Seu Restaurante</Tooltip>
        </Marker>
      )}

      {/* Círculos das Zonas de Entrega Existentes */}
      {sortedZones.map((zone, index) => {
        if (!zone.max_distance_km || zone.max_distance_km <= 0) return null;
        
        const radiusInMeters = zone.max_distance_km * 1000;
        const color = zoneColors[index % zoneColors.length];

        // Usamos o centro do restaurante como centro da zona, pois a lógica atual é baseada em raio a partir do restaurante.
        // Se a intenção for ter zonas com centros diferentes, a tabela 'delivery_zones' precisaria de lat/lng.
        // Mantendo a lógica atual: raio a partir do restaurante.
        return (
          <Circle
            key={zone.id}
            center={restaurantCenter}
            radius={radiusInMeters}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 2 }}
          >
            <Tooltip sticky>
              {zone.name} <br />
              Até {zone.max_distance_km} km <br />
              Taxa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(zone.delivery_fee || 0)}
            </Tooltip>
          </Circle>
        );
      })}

      <MapClickHandler onNewZoneCenter={onNewZoneCenter} />
    </MapContainer>
  );
};