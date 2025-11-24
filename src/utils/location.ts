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
 * Geocodifica um endereço e valida os componentes.
 * 
 * @param address - Endereço completo (Rua, Número, Bairro, Cidade, CEP)
 * @param expectedComponents - Componentes esperados para validação (bairro, cidade) - AGORA IGNORADO
 * @returns Promise com { lat: number, lng: number } ou null se falhar.
 */
export const geocodeAddress = async (
  address: string,
  expectedComponents?: { neighborhood?: string; city?: string }
): Promise<{ lat: number; lng: number } | null> => {
  const sanitizedAddress = address.replace(/\s+/g, ' ').trim();
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(sanitizedAddress)}&limit=1&addressdetails=1`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    console.log("LOG: geocodeAddress - URL da API:", nominatimUrl);
    const response = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        // É uma boa prática identificar o aplicativo
        'User-Agent': 'Pedido123-App/1.0 (https://juniorsampaiobr-code.github.io/pedido123new/)'
      }
    });

    if (!response.ok) {
      console.error("LOG: geocodeAddress - Resposta da API não OK. Status:", response.status);
      return null;
    }

    const data = await response.json();

    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log("LOG: geocodeAddress - Geocodificação bem-sucedida. Coordenadas:", [lat, lon]);
        
        // Removemos a validação estrita de bairro/cidade aqui.
        // Apenas garantimos que as coordenadas foram encontradas.

        return { lat, lng: lon };
      }
    }

    console.warn("LOG: geocodeAddress - Falha. Nenhum resultado encontrado ou coordenadas inválidas para:", sanitizedAddress);
    toast.error("Não foi possível encontrar o endereço. Verifique todos os campos e tente novamente.");
    return null;

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("LOG: geocodeAddress - Timeout na requisição (10s). Endereço:", sanitizedAddress);
      toast.error("A requisição para encontrar o endereço demorou muito. Tente novamente.");
    } else {
      console.error("LOG: geocodeAddress - Erro durante a requisição:", error);
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
    
    const minTime = zone.min_delivery_time_minutes || 0;
    const maxTime = minTime + 15; // Estimativa simples

    return { 
      fee: parseFloat(fixedFee.toFixed(2)),
      minTime: minTime,
      maxTime: maxTime,
    };
  }

  return null; // Fora da área de entrega
};