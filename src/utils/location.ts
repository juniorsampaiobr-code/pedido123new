import { toast } from "sonner";

// Função para calcular a distância Haversine entre dois pontos (em km)
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Simula a geocodificação de um endereço e retorna as coordenadas.
 * Em um ambiente de produção, isso usaria uma API de geocodificação (ex: Google Maps, Nominatim).
 * 
 * @param address - Endereço completo (Rua, Número, Cidade, CEP)
 * @returns Promise com [latitude, longitude] ou null se falhar.
 */
export const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  
  try {
    const response = await fetch(nominatimUrl);
    if (!response.ok) throw new Error("Falha na API de geocodificação.");
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        return [lat, lon];
      }
    }
    
    // Fallback para simulação se a API falhar ou não encontrar
    console.warn("Geocodificação falhou para o endereço:", address, "Usando coordenadas padrão.");
    return null; 

  } catch (error) {
    console.error("Erro durante a geocodificação:", error);
    toast.error("Erro ao buscar coordenadas do endereço. Verifique o endereço.");
    return null;
  }
};

/**
 * Calcula a taxa de entrega com base na distância e nas zonas configuradas.
 * 
 * @param customerCoords - Coordenadas [lat, lng] do cliente.
 * @param restaurantCoords - Coordenadas [lat, lng] do restaurante.
 * @param deliveryZones - Lista de zonas de entrega configuradas.
 * @returns Taxa de entrega (number) ou null se fora da área.
 */
export const calculateDeliveryFee = (
  customerCoords: [number, number],
  restaurantCoords: [number, number],
  deliveryZones: any[] // Usamos 'any' aqui para evitar dependência circular de types.ts
): { fee: number } | null => {
  
  const distance = haversineDistance(
    restaurantCoords[0], 
    restaurantCoords[1], 
    customerCoords[0], 
    customerCoords[1]
  );

  // Encontrar a zona que cobre esta distância.
  // As zonas devem estar ordenadas por max_distance_km (ascendente)
  const zone = deliveryZones.find(z => distance <= z.max_distance_km);

  if (zone) {
    // A taxa é apenas a taxa fixa da zona (delivery_fee)
    const fixedFee = zone.delivery_fee || 0;
    
    return { 
      fee: parseFloat(fixedFee.toFixed(2)),
    };
  }

  return null; // Fora da área de entrega
};