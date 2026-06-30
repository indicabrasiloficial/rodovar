export interface TrackerLinkParams {
  baseUrl?: string;
  cargoId: string;
  driver: string;
  route: string;
  client: string;
}

export function generateTrackerLink({ baseUrl, cargoId, driver, route, client }: TrackerLinkParams): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const cleanBase = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  
  const params = new URLSearchParams({
    cargoId: cargoId,
    driver: driver,
    route: route,
    client: client
  });

  return `${cleanBase}/tracker.html?${params.toString()}`;
}

export function openWhatsAppTrackerLink(params: TrackerLinkParams) {
  const link = generateTrackerLink(params);
  const text = `Olá, aqui é da central de monitoramento RODOVAR! Por favor, acesse o link a seguir e clique em "INICIAR CORRIDA" para habilitar o rastreamento GPS em background de sua viagem: ${link}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  
  if (typeof window !== 'undefined') {
    window.open(whatsappUrl, 'whatsapp');
  }
}
