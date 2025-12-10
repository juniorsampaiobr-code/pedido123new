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
 * @returns Promise com { lat: number, lng: number } ou null se falhar.
 */
export const geocodeAddress = async (
  address: string,
): Promise<{ lat: number; lng: number } | null> => {
  const sanitizedAddress = address.replace(/\s+/g, ' ').trim();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let data: any;
    let source = 'Nominatim';

    if (apiKey) {
      // Tenta usar a API de Geocodificação do Google Maps (mais precisa)
      source = 'Google Maps Geocoding';
      
      // 1. Remove o CEP da string de busca para o Google Maps (melhora a precisão)
      // O CEP é o último componente após a última vírgula, se for numérico.
      const parts = sanitizedAddress.split(',').map(p => p.trim());
      
      // Verifica se o último componente parece ser um CEP (5 dígitos + '-' + 3 dígitos)
      const lastPart = parts[parts.length - 1];
      const isZipCode = /^\d{5}-?\d{3}$/.test(lastPart.replace(/\s/g, ''));
      
      let googleAddress = sanitizedAddress;
      if (isZipCode && parts.length > 1) {
          // Remove o CEP da string de busca
          googleAddress = parts.slice(0, parts.length - 1).join(', ');
      }
      
      // 2. Adiciona o parâmetro de componentes (país: Brasil)
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(googleAddress)}&components=country:BR&key=${apiKey}`;
      
      console.log("LOG: geocodeAddress - URL da API (Google):", googleUrl);
      const response = await fetch(googleUrl, { signal: controller.signal });
      
      if (!response.ok) {
        console.error("LOG: geocodeAddress (Google) - Resposta da API não OK. Status:", response.status);
        // Se o Google falhar, tenta o Nominatim como fallback
      } else {
        data = await response.json();
        
        if (data.status === 'REQUEST_DENIED') {
            console.error("LOG: Google Maps Geocoding API retornou REQUEST_DENIED. Verifique se a 'Geocoding API' está ativada e se as restrições da chave estão corretas.");
        }
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          const lat = location.lat;
          const lon = location.lng;
          
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            console.log(`LOG: geocodeAddress (${source}) - Geocodificação bem-sucedida. Coordenadas:`, [lat, lon]);
            clearTimeout(timeoutId);
            return { lat, lng: lon };
          }
        }
        
        // Se o Google falhar na busca (e.g., ZERO_RESULTS ou REQUEST_DENIED), cai para o Nominatim
        console.warn(`LOG: geocodeAddress (Google) - Falha na busca. Status: ${data.status}. Tentando Nominatim.`);
      }
    }

    // Fallback para Nominatim (OpenStreetMap)
    source = 'Nominatim';
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(sanitizedAddress)}&limit=1&addressdetails=1`;

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

    data = await response.json();

    if (data && Array.isArray(data) && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log(`LOG: geocodeAddress (${source}) - Geocodificação bem-sucedida. Coordenadas:`, [lat, lon]);
        clearTimeout(timeoutId);
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