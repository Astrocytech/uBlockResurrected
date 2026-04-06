// Debug script - check what's happening
setTimeout(function() {
    console.log("[DEBUG] Running...");
    console.log("[DEBUG] vAPI:", typeof vAPI);
    console.log("[DEBUG] vAPI.messaging:", typeof vAPI && vAPI.messaging);
    
    // Check DOM
    var hostname = document.getElementById('hostname');
    console.log("[DEBUG] #hostname:", hostname);
    console.log("[DEBUG] #hostname children:", hostname ? hostname.children.length : 0);
    
    // Check body classes
    console.log("[DEBUG] body classList:", document.body.classList.toString());
    
    // Change background to prove CSS works
    document.body.style.backgroundColor = 'lime';
    console.log("[DEBUG] Set background to lime");
}, 500);