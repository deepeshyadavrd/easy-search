// Popup script for extension settings and stats
document.addEventListener('DOMContentLoaded', function() {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const brandCount = document.getElementById('brandCount');
  const techCount = document.getElementById('techCount');
  const totalCount = document.getElementById('totalCount');

  // Load current settings
  chrome.storage.sync.get(['smartLinkEnabled'], function(result) {
    const isEnabled = result.smartLinkEnabled !== false; // Default to true
    updateToggleSwitch(isEnabled);
  });

  // Load current page stats
  loadPageStats();

  // Toggle switch event
  toggleSwitch.addEventListener('click', function() {
    const isCurrentlyEnabled = toggleSwitch.classList.contains('active');
    const newState = !isCurrentlyEnabled;
    
    chrome.storage.sync.set({ smartLinkEnabled: newState }, function() {
      updateToggleSwitch(newState);
      
      // Send message to content script to update
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleSmartLinks',
          enabled: newState
        });
        
        // Refresh stats after a short delay
        setTimeout(loadPageStats, 500);
      });
    });
  });

  function updateToggleSwitch(enabled) {
    if (enabled) {
      toggleSwitch.classList.add('active');
    } else {
      toggleSwitch.classList.remove('active');
    }
  }

  function loadPageStats() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getStats'
      }, function(response) {
        if (response) {
          brandCount.textContent = response.brandCount || 0;
          techCount.textContent = response.techCount || 0;
          totalCount.textContent = response.totalCount || 0;
        } else {
          // If no response, try to count from DOM
          chrome.tabs.executeScript(tabs[0].id, {
            code: `
              const brandLinks = document.querySelectorAll('.smart-link-brand').length;
              const techLinks = document.querySelectorAll('.smart-link-tech').length;
              ({ brandCount: brandLinks, techCount: techLinks, totalCount: brandLinks + techLinks });
            `
          }, function(result) {
            if (result && result[0]) {
              brandCount.textContent = result[0].brandCount || 0;
              techCount.textContent = result[0].techCount || 0;
              totalCount.textContent = result[0].totalCount || 0;
            }
          });
        }
      });
    });
  }

  // Refresh stats every 2 seconds while popup is open
  const statsInterval = setInterval(loadPageStats, 2000);
  
  // Clean up interval when popup closes
  window.addEventListener('beforeunload', function() {
    clearInterval(statsInterval);
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'updateStats') {
    document.getElementById('brandCount').textContent = request.brandCount || 0;
    document.getElementById('techCount').textContent = request.techCount || 0;
    document.getElementById('totalCount').textContent = request.totalCount || 0;
  }
});