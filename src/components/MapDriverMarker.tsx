import L from 'leaflet';

export function createTruckIcon(status: 'live' | 'offline' | 'delivered') {
  const isLive     = status === 'live';
  const isOffline  = status === 'offline';
  const color      = isLive ? '#f5c518' : isOffline ? '#ef4444' : '#22c55e';
  const pulse      = isLive ? `
    @keyframes ripple {
      0%   { transform: scale(1);   opacity: 0.8; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .ring { animation: ripple 1.5s infinite; }
  ` : '';

  const html = `
    <div style="position:relative; width:48px; height:56px;">
      <style>${pulse}</style>
      ${isLive ? `<div class="ring" style="
        position:absolute; top:4px; left:4px;
        width:40px; height:40px; border-radius:50%;
        border: 3px solid #22c55e; opacity:0.8;
      "></div>` : ''}
      <div style="
        width:48px; height:48px; border-radius:50%;
        background: ${color}22;
        border: 3px solid ${color};
        display:flex; align-items:center; justify-content:center;
        font-size:22px; position:relative; z-index:2;
      ">🚛</div>
      <div style="
        position:absolute; bottom:-4px; left:50%;
        transform:translateX(-50%);
        background:${color}; color:#000;
        font-size:8px; font-weight:900;
        padding:2px 6px; border-radius:100px;
        white-space:nowrap; letter-spacing:0.5px;
        font-family: monospace;
      ">${isLive ? 'AO VIVO' : isOffline ? 'SEM SINAL' : 'ENTREGUE'}</div>
    </div>
  `;

  return L.divIcon({
    html,
    iconSize: [48, 60],
    iconAnchor: [24, 60],
    popupAnchor: [0, -60],
    className: ''
  });
}

export function getDriverPopupContent(
  driverName: string,
  route: string,
  client: string,
  liveStatus: 'live' | 'offline' | 'delivered',
  lastTs: number
): string {
  const secondsAgo = Math.max(0, Math.floor((Date.now() - lastTs) / 1000));
  let timeStr = '';
  
  if (secondsAgo < 60) {
    timeStr = `${secondsAgo} seg atrás`;
  } else {
    const minsAgo = Math.floor(secondsAgo / 60);
    timeStr = `${minsAgo} min atrás`;
  }

  const badgeHtml = liveStatus === 'live' 
    ? `<span style="background-color: #064e3b; color: #34d399; border: 1px solid #047857; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; font-family: monospace;">🟢 AO VIVO</span>`
    : liveStatus === 'offline'
    ? `<span style="background-color: #7f1d1d; color: #fca5a5; border: 1px solid #b91c1c; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; font-family: monospace;">🔴 SEM SINAL</span>`
    : `<span style="background-color: #064e3b; color: #a7f3d0; border: 1px solid #059669; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; font-family: monospace;">✅ ENTREGUE</span>`;

  return `
    <div style="font-family: 'Inter', sans-serif; color: #f4f4f5; background-color: #121212; padding: 8px; border-radius: 8px; min-width: 200px; line-height: 1.4;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #27272a; padding-bottom: 6px;">
        <span style="font-size: 12px; font-weight: 900; color: #ffd600; text-transform: uppercase;">MONITORAMENTO GPS</span>
        ${badgeHtml}
      </div>
      <div style="margin-bottom: 6px;">
        <span style="font-size: 10px; color: #a1a1aa; display: block; font-family: monospace; text-transform: uppercase;">Motorista:</span>
        <strong style="font-size: 13px; color: #ffffff;">${driverName}</strong>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="font-size: 10px; color: #a1a1aa; display: block; font-family: monospace; text-transform: uppercase;">Rota:</span>
        <span style="font-size: 12px; color: #e4e4e7; font-weight: 600;">${route}</span>
      </div>
      <div style="margin-bottom: 6px;">
        <span style="font-size: 10px; color: #a1a1aa; display: block; font-family: monospace; text-transform: uppercase;">Cliente:</span>
        <span style="font-size: 12px; color: #d4d4d8;">${client}</span>
      </div>
      <div style="border-t: 1px solid #27272a; padding-top: 6px; font-size: 10px; color: #a1a1aa; font-family: monospace;">
        ${liveStatus === 'live' ? `Última atualização: ${timeStr}` : `Última conexão: ${timeStr}`}
      </div>
    </div>
  `;
}
