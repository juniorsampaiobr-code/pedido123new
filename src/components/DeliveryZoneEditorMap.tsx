import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useRef, useCallback } from 'react';
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
  onZoneRadiusChange: (index: number, newRadiusKm: number) => void;
  onMapClick: (lat: number, lng: number) => void; // Novo prop para cliques no mapa
}

const zoneColors = [
  'rgba(59, 130, 246, 0.4)',  // blue-500
  'rgba(16, 185, 129, 0.4)', // emerald-500
  'rgba(239, 68, 68, 0.4)',   // red-500
  'rgba(249, 115, 22, 0.4)',  // orange-500
  'rgba(139, 92, 246, 0.4)',  // violet-500
];

// Componente auxiliar para permitir o redimensionamento do círculo
interface ResizableCircleProps {
  center: [number, number];
  radiusKm: number;
  color: string;
  name: string;
  fee: number;
  onRadiusChange: (newRadiusKm: number) => void;
}

const ResizableCircle = ({ center, radiusKm, color, name, fee, onRadiusChange }: ResizableCircleProps) => {
  const map = useMap();
  const circleRef = useRef<L.Circle>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Adiciona verificação de segurança
  const safeRadiusKm = typeof radiusKm === 'number' && !isNaN(radiusKm) ? radiusKm : 0.1;
  const radiusInMeters = safeRadiusKm * 1000;

  // 1. Manipulador de Movimento (Move)
  const handleMouseMove = useCallback((e: L.LeafletMouseEvent) => {
    if (!isResizing || !circleRef.current) return;

    const circle = circleRef.current;
    const centerLatLng = circle.getLatLng();
    const newDistanceMeters = centerLatLng.distanceTo(e.latlng);
    
    // Atualiza o raio do círculo no mapa
    circle.setRadius(newDistanceMeters);
    
    // Atualiza o raio no estado do React (convertendo para KM)
    const newRadiusKm = Math.max(0.1, newDistanceMeters / 1000); // Mínimo de 0.1km
    onRadiusChange(newRadiusKm);
  }, [isResizing, onRadiusChange]);

  // 2. Manipulador de Soltura (Up)
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    map.dragging.enable();
    map.off('mousemove', handleMouseMove);
    map.off('mouseup', handleMouseUp);
    map.getContainer().style.cursor = ''; // Restaura o cursor
  }, [map, handleMouseMove]);

  // 3. Manipulador de Clique (Down) - Inicia o redimensionamento
  const handleMouseDown = useCallback((e: L.LeafletMouseEvent) => {
    // Previne que o evento se propague para o mapa (evita arrastar o mapa)
    L.DomEvent.stop(e); 
    
    setIsResizing(true);
    map.dragging.disable();
    
    // Anexa os manipuladores de movimento e soltura ao MAPA
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);
    map.getContainer().style.cursor = 'crosshair';
  }, [map, handleMouseMove, handleMouseUp]);

  // 4. Efeito para anexar o listener de mousedown ao círculo
  useEffect(() => {
    const circle = circleRef.current;
    if (circle) {
      // Anexa o manipulador de mousedown diretamente ao elemento SVG do círculo
      circle.on('mousedown', handleMouseDown);
    }
    return () => {
      if (circle) {
        circle.off('mousedown', handleMouseDown);
      }
      // Garante que os listeners globais sejam removidos na desmontagem
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
    };
  }, [map, handleMouseDown, handleMouseMove, handleMouseUp]);

  return (
    <Circle
      ref={circleRef}
      center={center}
      radius={radiusInMeters}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 2, interactive: true }}
    >
      <Tooltip sticky>
        {name} <br />
        Até {safeRadiusKm.toFixed(2)} km <br />
        Taxa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fee || 0)}
        <br />
        <span className="font-bold">Clique e arraste para redimensionar</span>
      </Tooltip>
    </Circle>
  );
};

// Novo componente para capturar cliques no mapa
const MapClickZoneAdder = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const DeliveryZoneEditorMap = ({ restaurantCenter, zones, onZoneRadiusChange, onMapClick }: DeliveryZoneEditorMapProps) => {
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
      
      <MapClickZoneAdder onMapClick={onMapClick} />

      {/* Marcador do Restaurante (Centro das Zonas) */}
      {(restaurantCenter[0] !== 0 || restaurantCenter[1] !== 0) && (
        <Marker position={restaurantCenter}>
          <Tooltip permanent>Seu Restaurante (Centro das Zonas)</Tooltip>
        </Marker>
      )}

      {/* Círculos das Zonas de Entrega Existentes */}
      {sortedZones.map((zone, index) => {
        if (!zone.max_distance_km || zone.max_distance_km <= 0) return null;
        
        const color = zoneColors[index % zoneColors.length];

        return (
          <ResizableCircle
            key={zone.id || index}
            center={restaurantCenter}
            radiusKm={zone.max_distance_km}
            color={color}
            name={zone.name}
            fee={zone.delivery_fee}
            onRadiusChange={(newRadiusKm) => onZoneRadiusChange(index, newRadiusKm)}
          />
        );
      })}
    </MapContainer>
  );
};