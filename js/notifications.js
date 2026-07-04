// Проверяем незакрытые заказы и показываем плашку
async function checkPendingOrders() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch('https://rust-mobile-version-2.onrender.com/my-orders', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const orders = await res.json();
        const pending = orders.filter(o => o.status === 'pending');
        if (pending.length === 0) return;

        const banner = document.createElement('div');
        banner.id = 'pendingOrdersBanner';
        banner.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(255,122,61,0.15), rgba(138,92,255,0.15));
            border: 1px solid rgba(255,122,61,0.4);
            border-radius: 14px;
            padding: 14px 20px;
            z-index: 8888;
            max-width: 90%;
            width: 380px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            backdrop-filter: blur(10px);
        `;
        banner.innerHTML = `
            <div style="font-size:24px;">📦</div>
            <div style="flex:1;">
                <p style="color:#ff7a3d; font-weight:700; font-size:13px; margin-bottom:2px;">Заказ ожидает выдачи</p>
                <p style="color:rgba(255,255,255,0.6); font-size:12px;">Напишите в Telegram <a href="https://t.me/ТВОЙ_НИК" target="_blank" style="color:#00e5ff;">@ТВОЙ_НИК</a> номер заказа и игровой ник</p>
            </div>
            <button onclick="document.getElementById('pendingOrdersBanner').remove()" style="background:none; border:none; color:rgba(255,255,255,0.4); font-size:18px; cursor:pointer; padding:4px;">✕</button>
        `;
        document.body.appendChild(banner);
    } catch {}
}


document.addEventListener('DOMContentLoaded', checkPendingOrders);
