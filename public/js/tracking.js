(function initAnalyticsTracker() {

    function getOrCreateSessionId() {
        let sessionId = localStorage.getItem('board_algo_session');
        if (!sessionId) {
            sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
            localStorage.setItem('board_algo_session', sessionId);
        }
        return sessionId;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const utm_source = urlParams.get('utm_source') || null;
    const utm_campaign = urlParams.get('utm_campaign') || null;
    const currentPage = window.location.pathname;

    function getDeviceType() {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'TABLET';
        if (/Mobile|iP(hone|od)|Android/.test(ua)) return 'MOBILE';
        return 'DESKTOP';
    }

    const sessionData = {
        session_cookie_id: getOrCreateSessionId(),
        utm_source,
        utm_campaign,
        landing_page: currentPage,
        device_type: getDeviceType(),
        is_update: false
    };

    fetch('/api/analytics/log-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
        keepalive: true
    }).catch(() => {});

    const entryTime = Date.now();

    function handleExit() {
        const timeSpent = Math.floor((Date.now() - entryTime) / 1000);

        const exitData = JSON.stringify({
            session_cookie_id: sessionData.session_cookie_id,
            drop_off_page: window.location.pathname,
            time_spent_sec: timeSpent,
            is_update: true
        });

        navigator.sendBeacon(
            '/api/analytics/log-visit',
            new Blob([exitData], { type: 'application/json' })
        );
    }

    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') handleExit();
    });

    window.addEventListener('pagehide', handleExit);

})();