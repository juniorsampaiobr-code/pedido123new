import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useRef, useCallback, memo } from 'react';
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
  onZoneCenterChange: (index: number, lat: number, lng: number) => void;
  onMapClick: (lat: number, lng: number) => void;
}

const zoneColors = [
  'rgba(59, 130, 246, 0.4)',
  'rgba(16, 185, 129, 0.4)',
  'rgba(239, 68, 68, 0.4)',
  'rgba(249, 115, 22, 0.4)',
  'rgba(139, 92, 246, 0.4)',
];

interface ResizableCircleProps {
  index: number;
  center: [number, number];
  radiusKm: number;
  color: string;
  name: string;
  fee: number;
  onRadiusChange: (newRadiusKm: number) => void;
  onCenterChange: (lat: number, lng: number) => void;
}

const ResizableCircle = ({ index, center, radiusKm, color, name, fee, onRadiusChange, onCenterChange }: ResizableCircleProps) => {
  const map = useMap();
  const circleRef = useRef<L.Circle>(null);
  const isResizingRef = useRef(false);

  const safeRadiusKm = typeof radiusKm === 'number' && !isNaN(radiusKm) ? radiusKm : 0.1;
  const radiusInMeters = safeRadiusKm * 1000;

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusInMeters);
    }
  }, [radiusInMeters]);

  const handleMouseMove = useCallback((e: L.LeafletMouseEvent) => {
    if (!isResizingRef.current || !circleRef.current) return;

    const circle = circleRef.current;
    const centerLatLng = circle.getLatLng();
    const newDistanceMeters = centerLatLng.distanceTo(e.latlng);
    
    circle.setRadius(newDistanceMeters);
    
    const newRadiusKm = Math.max(0.1, newDistanceMeters / 1000);
    onRadiusChange(newRadiusKm);
  }, [onRadiusChange]);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    map.dragging.enable();
    map.off('mousemove', handleMouseMove);
    map.off('mouseup', handleMouseUp);
    map.getContainer().style.cursor = '';
  }, [map, handleMouseMove]);

  const handleMouseDown = useCallback((e: L.LeafletMouseEvent) => {
    L.DomEvent.stop(e);
    
    isResizingRef.current = true;
    map.dragging.disable();
    
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);
    map.getContainer().style.cursor = 'crosshair';
  }, [map, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const circle = circleRef.current;
    if (circle) {
      circle.on('mousedown', handleMouseDown);
    }
    return () => {
      if (circle) {
        circle.off('mousedown', handleMouseDown);
      }
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
    };
  }, [map, handleMouseDown, handleMouseMove, handleMouseUp]);

  return (
    <>
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
          <span className="font-bold">Clique e arraste a borda para redimensionar</span>
        </Tooltip>
      </Circle>
      
      <Marker
        position={center}
        draggable={true}
        eventHandlers={{
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng();
            onCenterChange(lat, lng);
          },
        }}
      >
        <Tooltip permanent direction="top" offset={[0, -10]}>
          {name}
        </Tooltip>
      </Marker>
    </>
  );
};

const MapClickZoneAdder = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const DeliveryZoneEditorMapComponent = ({ restaurantCenter, zones, onZoneRadiusChange, onZoneCenterChange, onMapClick }: DeliveryZoneEditorMapProps) => {
  const sortedZones = [...zones].sort((a, b) => (a.max_distance_km || 0) - (b.max_distance_km || 0));
  const [mapCenter, setMapCenter] = useState(restaurantCenter);

  useEffect(() => {
    if (sortedZones.length > 0 && sortedZones[0].center_latitude && sortedZones[0].center_longitude) {
        setMapCenter([sortedZones[0].center_latitude, sortedZones[0].center_longitude]);
    } else if (restaurantCenter[0] !== 0 || restaurantCenter[1] !== 0) {
      setMapCenter(restaurantCenter);
    }
  }, [restaurantCenter, sortedZones]);

  return (
    <MapContainer center={mapCenter} zoom={14} scrollWheelZoom={false} className="h-96 w-full rounded-lg z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapClickZoneAdder onMapClick={onMapClick} />

      {(restaurantCenter[0] !== 0 || restaurantCenter[1] !== 0) && (
        <Marker position={restaurantCenter} opacity={0.5}>
          <Tooltip permanent>Local do Restaurante</Tooltip>
        </Marker>
      )}

      {sortedZones.map((zone, index) => {
        if (!zone.max_distance_km || zone.max_distance_km <= 0) return null;
        
        const color = zoneColors[index % zoneColors.length];
        const center: [number, number] = [
            zone.center_latitude || restaurantCenter[0], 
            zone.center_longitude || restaurantCenter[1]
        ];

        return (
          <ResizableCircle
            key={zone.id || index}
            index={index}
            center={center}
            radiusKm={zone.max_distance_km}
            color={color}
            name={zone.name}
            fee={zone.delivery_fee}
            onRadiusChange={(newRadiusKm) => onZoneRadiusChange(index, newRadiusKm)}
            onCenterChange={(lat, lng) => onZoneCenterChange(index, lat, lng)}
          />
        );
      })}
    </MapContainer>
  );
};

export const DeliveryZoneEditorMap = memo(DeliveryZoneEditorMapComponent);