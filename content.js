// Content script that runs on all pages
class SmartLinkCreator {
  constructor() {
    this.isEnabled = true;
    this.processedElements = new Set();
    this.brandPatterns = [
      // Tech companies
      /\b(Google|Microsoft|Apple|Amazon|Meta|Facebook|Netflix|Tesla|Spotify|Adobe|Salesforce|Oracle|IBM|Intel|AMD|NVIDIA|Qualcomm|Samsung|LG|Sony|Huawei|Xiaomi)\b/gi,
      // SaaS and tools
      /\b(Slack|Zoom|Trello|Asana|Notion|Figma|Canva|Shopify|WordPress|Mailchimp|HubSpot|Zendesk|Dropbox|OneDrive|GitHub|GitLab|Jira|Confluence)\b/gi,
      // Cloud services
      /\b(AWS|Azure|GCP|DigitalOcean|Heroku|Vercel|Netlify|CloudFlare)\b/gi,
      // Financial
      /\b(PayPal|Stripe|Square|Venmo|Coinbase|Robinhood|Chase|Wells Fargo|Bank of America)\b/gi,
    ];
    
    this.technicalTerms = [
      // Programming
      /\b(JavaScript|Python|Java|React|Vue|Angular|Node\.js|Django|Flask|Spring|Laravel|Ruby on Rails|Docker|Kubernetes|API|REST|GraphQL|MongoDB|PostgreSQL|MySQL|Redis)\b/gi,
      // Business terms
      /\b(SaaS|B2B|B2C|CRM|ERP|KPI|ROI|SEO|SEM|PPC|CTR|conversion rate|A\/B testing|machine learning|artificial intelligence|blockchain|cryptocurrency)\b/gi,
      // General tech
      /\b(cloud computing|microservices|DevOps|CI\/CD|agile|scrum|UX|UI|responsive design|mobile-first|progressive web app|PWA)\b/gi
    ];

    this.init();
  }

  init() {
    // Load settings
    chrome.storage.sync.get(['smartLinkEnabled'], (result) => {
      this.isEnabled = result.smartLinkEnabled !== false; // Default to true
      if (this.isEnabled) {
        this.processPage();
        this.observeChanges();
      }
    });

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.smartLinkEnabled) {
        this.isEnabled = changes.smartLinkEnabled.newValue;
        if (this.isEnabled) {
          this.processPage();
        } else {
          this.removeAllLinks();
        }
      }
    });
  }

  processPage() {
    // Process text content in common content areas
    const selectors = [
      'article', 'main', '.content', '.post', '.article', 
      'p', 'div', 'span', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => this.processElement(element));
    });
  }

  processElement(element) {
    // Skip if already processed or if it's a link, script, style, etc.
    if (this.processedElements.has(element) || 
        element.tagName === 'A' || 
        element.tagName === 'SCRIPT' || 
        element.tagName === 'STYLE' ||
        element.classList.contains('smart-link-created')) {
      return;
    }

    // Only process elements with direct text content
    const textNodes = this.getTextNodes(element);
    
    textNodes.forEach(textNode => {
      const originalText = textNode.textContent;
      let modifiedText = originalText;
      const replacements = [];

      // Find brand matches
      this.brandPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(originalText)) !== null) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            type: 'brand'
          });
        }
      });

      // Find technical term matches
      this.technicalTerms.forEach(pattern => {
        let match;
        while ((match = pattern.exec(originalText)) !== null) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            type: 'tech'
          });
        }
      });

      // Sort replacements by position and remove overlaps
      replacements.sort((a, b) => a.start - b.start);
      const cleanReplacements = this.removeOverlaps(replacements);

      if (cleanReplacements.length > 0) {
        this.replaceTextWithLinks(textNode, cleanReplacements);
      }
    });

    this.processedElements.add(element);
  }

  getTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if parent is already a link or has been processed
          if (node.parentElement.tagName === 'A' || 
              node.parentElement.classList.contains('smart-link-wrapper')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    return textNodes;
  }

  removeOverlaps(replacements) {
    const clean = [];
    let lastEnd = 0;

    for (const replacement of replacements) {
      if (replacement.start >= lastEnd) {
        clean.push(replacement);
        lastEnd = replacement.end;
      }
    }

    return clean;
  }

  replaceTextWithLinks(textNode, replacements) {
    const parent = textNode.parentNode;
    const originalText = textNode.textContent;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();

    replacements.forEach(replacement => {
      // Add text before the match
      if (replacement.start > lastIndex) {
        const beforeText = originalText.substring(lastIndex, replacement.start);
        fragment.appendChild(document.createTextNode(beforeText));
      }

      // Create the smart link
      const link = this.createSmartLink(replacement.text, replacement.type);
      fragment.appendChild(link);

      lastIndex = replacement.end;
    });

    // Add remaining text
    if (lastIndex < originalText.length) {
      const afterText = originalText.substring(lastIndex);
      fragment.appendChild(document.createTextNode(afterText));
    }

    // Replace the text node with the fragment
    parent.replaceChild(fragment, textNode);
  }

  createSmartLink(text, type) {
    const wrapper = document.createElement('span');
    wrapper.className = `smart-link-wrapper smart-link-${type}`;
    wrapper.textContent = text;
    wrapper.title = `Click to search: ${text}`;
    
    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      window.open(searchUrl, '_blank');
    });

    return wrapper;
  }

  observeChanges() {
    // Watch for dynamic content changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processElement(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  removeAllLinks() {
    const smartLinks = document.querySelectorAll('.smart-link-wrapper');
    smartLinks.forEach(link => {
      const textNode = document.createTextNode(link.textContent);
      link.parentNode.replaceChild(textNode, link);
    });
    this.processedElements.clear();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SmartLinkCreator();
  });
} else {
  new SmartLinkCreator();
}