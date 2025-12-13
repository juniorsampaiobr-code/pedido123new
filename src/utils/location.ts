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
 * Geocodifica um endereço usando o serviço do Google Maps.
 *
 * @param address - Endereço completo (Rua, Número, Bairro, Cidade, CEP)
 * @returns Promise com { lat: number, lng: number } ou null se falhar.
 */
export const geocodeAddress = async (
  address: string,
): Promise<{ lat: number; lng: number } | null> => {
  // Verifica se o Google Maps está carregado
  if (typeof google === 'undefined' || !google.maps) {
    console.error("Google Maps SDK não carregado");
    toast.error("Serviço de mapa não disponível. Tente novamente.");
    return null;
  }

  const sanitizedAddress = address.replace(/\s+/g, ' ').trim();
  const geocoder = new google.maps.Geocoder();
  
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.error("Timeout na requisição de geocodificação");
      toast.error("A requisição para encontrar o endereço demorou muito. Tente novamente.");
      resolve(null);
    }, 10000); // 10 segundos de timeout

    geocoder.geocode(
      { 
        address: sanitizedAddress,
        componentRestrictions: {
          country: 'BR'
        }
      },
      (results, status) => {
        clearTimeout(timeoutId);
        
        if (status === 'OK' && results && results.length > 0) {
          const location = results[0].geometry.location;
          const lat = location.lat();
          const lng = location.lng();
          
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            console.log(`LOG: geocodeAddress (Google Maps Service) - Geocodificação bem-sucedida. Coordenadas:`, [lat, lng]);
            resolve({ lat, lng });
            return;
          }
        }
        
        console.warn(`LOG: geocodeAddress (Google Maps Service) - Falha na busca. Status: ${status}. Endereço: ${sanitizedAddress}`);
        // Fallback para Nominatim se o Google falhar
        fallbackToNominatim(sanitizedAddress).then(resolve);
      }
    );
  });
};

/**
 * Fallback para Nominatim (OpenStreetMap) caso o Google Maps falhe
 */
const fallbackToNominatim = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`;
    console.log("LOG: geocodeAddress - URL da API (Nominatim):", nominatimUrl);
    
    const response = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Pedido123-App/1.0 (https://juniorsampaiobr-code.github.io/pedido123new/)'
      }
    });
    
    if (!response.ok) {
      console.error("LOG: geocodeAddress (Nominatim) - Resposta da API não OK. Status:", response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log(`LOG: geocodeAddress (Nominatim) - Geocodificação bem-sucedida. Coordenadas:`, [lat, lon]);
        clearTimeout(timeoutId);
        return { lat, lng: lon };
      }
    }
    
    console.warn("LOG: geocodeAddress (Nominatim) - Falha. Nenhum resultado encontrado ou coordenadas inválidas para:", address);
    toast.error("Não foi possível encontrar o endereço. Verifique todos os campos e tente novamente.");
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("LOG: geocodeAddress (Nominatim) - Timeout na requisição (10s). Endereço:", address);
      toast.error("A requisição para encontrar o endereço demorou muito. Tente novamente.");
    } else {
      console.error("LOG: geocodeAddress (Nominatim) - Erro durante a requisição:", error);
      toast.error("Ocorreu um erro ao buscar o endereço. Tente novamente.");
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
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
): { fee: number, minTime: number, maxTime: number } | null => {
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
    // Usa o tempo mínimo configurado na zona
    const minTime = zone.min_delivery_time_minutes || 0;
    // Define o tempo máximo como o mínimo + 15 minutos (intervalo padrão)
    const maxTime = minTime + 15;
    
    return {
      fee: parseFloat(fixedFee.toFixed(2)),
      minTime: minTime,
      maxTime: maxTime,
    };
  }
  
  return null; // Fora da área de entrega
};