/*******************************************************************************

    uBlock Resurrected - Chromium WebRTC capability probe

*******************************************************************************/

(function() {
    let pc = null;
    try {
        const PC = self.RTCPeerConnection || self.webkitRTCPeerConnection;
        if ( PC ) {
            pc = new PC(null);
        }
    } catch (ex) {
        console.error(ex);
    }
    if ( pc !== null ) {
        pc.close();
    }

    window.top.postMessage(
        pc !== null ? 'webRTCSupported' : 'webRTCNotSupported',
        window.location.origin
    );
})();
