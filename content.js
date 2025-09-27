extractWords(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word));
  }

  calculateWordFrequency(words) {
    const freq = new Map();
    words.forEach(word => {
      freq.set(word, (freq.get(word) || 0) + 1);
    });
    return freq;
  }

  // Enhanced methods for better keyword extraction
  extractKeyphrases(text) {
    const phrases = [];
    
    // Look for capitalized phrases (potential proper nouns)
    const capitalizedPhrases = text.match(/[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){1,3}/g) || [];
    phrases.push(...capitalizedPhrases);
    
    // Look for technical terms with dots, hyphens, or camelCase
    const technicalTerms = text.match(/[a-zA-Z]+[.-][a-zA-Z]+(?:[.-][a-zA-Z]+)*/g) || [];
    phrases.push(...technicalTerms);
    
    // Look for quoted terms
    const quotedTerms = text.match(/"([^"]{3,30})"/g) || [];
    phrases.push(...quotedTerms.map(q => q.replace(/"/g, '')));
    
    // Look for terms in code blocks or backticks
    const codeTerms = text.match(/`([^`]{3,30})`/g) || [];
    phrases.push(...codeTerms.map(c => c.replace(/`/g, '')));
    
    // Look for terms in parentheses
    const parenthesisTerms = text.match(/\(([^)]{3,30})\)/g) || [];
    phrases.push(...parenthesisTerms.map(p => p.replace(/[()]/g, '')));
    
    return [...new Set(phrases)]
      .filter(phrase => this.isValidKeyword(phrase))
      .slice(0, 30);
  }

  extractNamedEntities(text) {
    const entities = [];
    
    // Look for potential company names (capitalized words with business suffixes)
    const companyPatterns = [
      /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Technologies|Tech|Systems|Software|Solutions|Labs|Group|Enterprises)\b/gi,
      /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:API|SDK|CRM|ERP|SaaS|AI|ML|Platform|Service|Services)\b/gi
    ];
    
    companyPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      entities.push(...matches);
    });
    
    // Look for URLs and extract domain names
    const urls = text.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi) || [];
    urls.forEach(url => {
      const domain = url.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9-]+)\./i);
      if (domain && domain[1] && domain[1].length > 2) {
        entities.push(domain[1]);
      }
    });
    
    // Look for @mentions and #hashtags
    const mentions = text.match(/@([a-zA-Z0-9_]{3,15})/g) || [];
    entities.push(...mentions.map(m => m.substring(1)));
    
    const hashtags = text.match(/#([a-zA-Z0-9_]{3,20})/g) || [];
    entities.push(...hashtags.map(h => h.substring(1)));
    
    return [...new Set(entities)]
      .filter(entity => this.isValidKeyword(entity))
      .slice(0, 25);
  }

  getWordImportance(word) {
    const lowerWord = word.toLowerCase();
    
    // Higher importance for seed keywords
    if (this.seedKeywords.has(lowerWord)) return 4;
    
    // Higher importance for capitalized words
    if (word[0] === word[0].toUpperCase()) return 3;
    
    // Higher importance for technical-looking terms
    if (/[A-Z]/.test(word) || /[.\-_]/.test(word)) return 2.5;
    
    // Higher importance for longer words (brands/products tend to be longer)
    if (word.length >= 6) return 2;
    
    return 1;
  }

  categorizeKeyword(keyword) {
    const lower = keyword.toLowerCase();
    
    // Tech terms
    if (/(?:js|css|html|api|sdk|sql|json|xml|http|tcp|udp|rest|graphql|oauth|jwt|cdn|dns|ssl|tls|vpn|aws|gcp|azure)/.test(lower) ||
        /(?:javascript|python|java|react|angular|vue|node|docker|kubernetes|mongodb|postgresql|mysql|redis|nginx|apache)/.test(lower)) {
      return 'tech';
    }
    
    // Business terms
    if (/(?:saas|crm|erp|kpi|roi|seo|sem|ppc|ctr|b2b|b2c|startup|unicorn|ipo|vc|ceo|cto|cfo)/.test(lower)) {
      return 'business';
    }
    
    // Brands/Companies (check if it has company indicators)
    if (/(?:inc|corp|llc|ltd|company|technologies|tech|systems|software|solutions|labs|group)/.test(lower) ||
        this.seedKeywords.has(lower)) {
      return 'brand';
    }
    
    return 'keyword';
  }

  // Add debugging method
  getKeywordStats() {
    const stats = {
      dynamicKeywords: this.dynamicKeywords.size,
      topKeywords: Array.from(this.dynamicKeywords.entries())
        .sort(([,a], [,b]) => b.score - a.score)
        .slice(0, 10)
        .map(([key, data]) => ({
          keyword: data.text,
          score: data.score,
          frequency: data.frequency,
          sources: Array.from(data.sources)
        }))
    };
    
    return stats;
  }// Content script that runs on all pages
class SmartLinkCreator {
  constructor() {
    this.isEnabled = true;
    this.processedElements = new Set();
    this.dynamicKeywords = new Map();
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it', 
      'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with', 'would', 'you', 'your', 'this', 
      'they', 'we', 'can', 'had', 'her', 'his', 'she', 'or', 'but', 'not', 'what', 'all', 'any', 
      'been', 'their', 'said', 'each', 'which', 'do', 'how', 'if', 'up', 'out', 'many', 'then', 
      'them', 'these', 'so', 'some', 'would', 'make', 'like', 'into', 'him', 'time', 'has',
      'two', 'more', 'very', 'when', 'come', 'may', 'get', 'use', 'man', 'new', 'now', 'old', 'see',
      'way', 'who', 'boy', 'did', 'number', 'no', 'could', 'people', 'my', 'than', 'first', 'been',
      'call', 'work', 'made', 'after', 'back', 'other', 'good', 'go', 'write', 'where', 'much', 'take',
      'why', 'help', 'put', 'end', 'try', 'ask', 'turn', 'move', 'live', 'year', 'place', 'over', 'just',
      'think', 'also', 'through', 'only', 'before', 'here', 'right', 'should', 'those', 'well', 'being',
      'same', 'never', 'most', 'must', 'might', 'going', 'still', 'another', 'does', 'without', 'every',
      'something', 'look', 'find', 'too', 'between', 'both', 'long', 'used', 'while', 'part', 'even'
    ]);

    this.init();
  }

  init() {
    try {
      chrome.storage.sync.get(['smartLinkEnabled'], (result) => {
        this.isEnabled = result.smartLinkEnabled !== false;
        if (this.isEnabled) {
          setTimeout(() => {
            this.processPage();
            this.observeChanges();
          }, 1000);
        }
      });

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

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
          if (request.action === 'getStats') {
            sendResponse(this.getCurrentStats());
          } else if (request.action === 'toggleSmartLinks') {
            this.isEnabled = request.enabled;
            if (this.isEnabled) {
              this.processPage();
            } else {
              this.removeAllLinks();
            }
          }
        } catch (e) {
          console.log('Message handling error:', e);
        }
        return true;
      });
    } catch (e) {
      console.log('Extension context not available, running in basic mode');
      this.isEnabled = true;
      setTimeout(() => {
        this.processPage();
        this.observeChanges();
      }, 1000);
    }
  }

  processPage() {
    console.log('🔍 Starting content analysis...');
    
    try {
      this.buildDynamicKeywordLibrary();
      const keywords = this.getTopKeywords();
      
      console.log(`📊 Found ${keywords.length} keywords:`, keywords.slice(0, 10).map(k => k.text));
      
      const selectors = ['p', 'div', 'span', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        Array.from(elements).forEach(element => {
          if (!this.processedElements.has(element)) {
            this.processElement(element, keywords);
          }
        });
      });
      
      console.log('✅ Processing complete');
    } catch (error) {
      console.error('Error processing page:', error);
    }
  }

  buildDynamicKeywordLibrary() {
    this.dynamicKeywords.clear();
    
    // Analyze page title with high weight
    const title = document.title || '';
    if (title) {
      this.extractKeywordsFromText(title, 10, 'title');
    }
    
    // Analyze headings
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    Array.from(headings).forEach((heading, index) => {
      const weight = Math.max(8 - index, 3); // H1=8, H2=7, etc., min 3
      this.extractKeywordsFromText(heading.textContent || '', weight, 'heading');
    });
    
    // Analyze emphasized text
    const emphasized = document.querySelectorAll('strong, b, em, mark');
    Array.from(emphasized).forEach(el => {
      this.extractKeywordsFromText(el.textContent || '', 3, 'emphasis');
    });
    
    // Analyze image alt text
    const images = document.querySelectorAll('img[alt]');
    Array.from(images).forEach(img => {
      this.extractKeywordsFromText(img.alt || '', 4, 'image');
    });
    
    // Analyze main content for frequency
    const mainContent = this.getMainContent();
    if (mainContent) {
      this.extractKeywordsFromText(mainContent, 1, 'content');
    }
    
    console.log(`🏗️ Built library with ${this.dynamicKeywords.size} potential keywords`);
  }

  getMainContent() {
    const selectors = ['article', 'main', '.content', '.post', '[role="main"]'];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.textContent || '';
      }
    }
    
    return document.body.textContent || '';
  }

  extractKeywordsFromText(text, weight, source) {
    if (!text || text.trim().length < 3) return;
    
    // Extract potential keywords using multiple patterns
    const candidates = new Set();
    
    // 1. Capitalized words (brands, proper nouns)
    const capitalizedWords = text.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,2}\b/g) || [];
    capitalizedWords.forEach(word => candidates.add(word.trim()));
    
    // 2. Technical terms with special characters
    const technicalTerms = text.match(/\b[a-zA-Z]+[._-][a-zA-Z]+(?:[._-][a-zA-Z]+)*\b/g) || [];
    technicalTerms.forEach(term => candidates.add(term));
    
    // 3. Quoted terms
    const quotedTerms = text.match(/"([^"]{3,25})"/g) || [];
    quotedTerms.forEach(quoted => {
      const clean = quoted.replace(/"/g, '');
      if (clean.length >= 3) candidates.add(clean);
    });
    
    // 4. Words in parentheses (often important terms/acronyms)
    const parenthesisTerms = text.match(/\(([A-Z]{2,}|[A-Z][a-zA-Z]{2,})\)/g) || [];
    parenthesisTerms.forEach(term => {
      const clean = term.replace(/[()]/g, '');
      if (clean.length >= 2) candidates.add(clean);
    });
    
    // 5. For content analysis, also get frequent words
    if (source === 'content') {
      const words = text.toLowerCase().match(/\b[a-zA-Z]{4,}\b/g) || [];
      const wordCount = new Map();
      
      words.forEach(word => {
        if (!this.stopWords.has(word)) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }
      });
      
      // Add frequently occurring words
      for (const [word, count] of wordCount.entries()) {
        if (count >= 3) {
          candidates.add(word);
        }
      }
    }
    
    // Add candidates to dynamic keywords
    candidates.forEach(candidate => {
      if (this.isValidKeyword(candidate)) {
        const key = candidate.toLowerCase();
        const existing = this.dynamicKeywords.get(key) || {
          text: candidate,
          score: 0,
          sources: new Set(),
          frequency: 0
        };
        
        existing.score += weight;
        existing.frequency += 1;
        existing.sources.add(source);
        this.dynamicKeywords.set(key, existing);
      }
    });
  }

  isValidKeyword(word) {
    if (!word || typeof word !== 'string') return false;
    
    const clean = word.trim();
    return clean.length >= 3 && 
           clean.length <= 30 && 
           !this.stopWords.has(clean.toLowerCase()) &&
           /[a-zA-Z]/.test(clean) &&
           !/^[\d\s\-_.,]+$/.test(clean) &&
           !/^(https?|www|com|org|net|edu|gov|html|css|js)$/i.test(clean);
  }

  getTopKeywords() {
    const keywords = Array.from(this.dynamicKeywords.values())
      .filter(k => k.score >= 3) // Minimum score threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, 50) // Limit to prevent overwhelming
      .map(k => ({
        text: k.text,
        score: k.score,
        type: this.categorizeKeyword(k)
      }));
    
    return keywords;
  }

  categorizeKeyword(keyword) {
    const text = keyword.text.toLowerCase();
    const sources = Array.from(keyword.sources);
    
    // High importance for title/heading keywords
    if (sources.includes('title') || sources.includes('heading')) {
      return 'brand';
    }
    
    // Technical terms
    if (text.includes('.') || text.includes('-') || text.includes('_') ||
        /(?:api|sdk|js|css|html|json|xml|sql|http|app|web|mobile|cloud|data|tech)/.test(text)) {
      return 'tech';
    }
    
    // Business terms  
    if (/(?:service|platform|solution|business|company|startup|market|sales|revenue)/.test(text)) {
      return 'business';
    }
    
    // High score keywords
    if (keyword.score >= 8) return 'high';
    
    return 'medium';
  }

  processElement(element, keywords) {
    if (this.processedElements.has(element) || 
        element.tagName === 'A' || 
        element.tagName === 'SCRIPT' || 
        element.tagName === 'STYLE' ||
        element.classList.contains('smart-link-wrapper')) {
      return;
    }

    const textNodes = this.getTextNodes(element);
    
    textNodes.forEach(textNode => {
      const originalText = textNode.textContent;
      if (!originalText || originalText.trim().length < 5) return;
      
      const replacements = this.findKeywordMatches(originalText, keywords);

      if (replacements.length > 0) {
        this.replaceTextWithLinks(textNode, replacements);
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

  findKeywordMatches(text, keywords) {
    const replacements = [];
    
    // Sort keywords by length (longest first) to avoid partial matches
    const sortedKeywords = keywords.sort((a, b) => b.text.length - a.text.length);
    
    for (const keyword of sortedKeywords) {
      const escapedKeyword = keyword.text.replace(/[.*+?^${}()|[\]\\]/g, '\\  // Initialize with message handling and runtime updates
  init() {
    // Load settings
    chrome.storage.sync.get(['smartLinkEnabled'], (result) => {
      this.isEnabled = result.smartLinkEnabled !== false; // Default to true
      if (this.isEnabled) {
        // Add small delay to ensure DOM is fully loaded
        setTimeout(() => {
          this.processPage();
          this.observeChanges();
        }, 500);
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

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getStats') {
        sendResponse(this.getCurrentStats());
      } else if (request.action === 'toggleSmartLinks') {
        this.isEnabled = request.enabled;
        if (this.isEnabled) {
          this.processPage();
        } else {
          this.removeAllLinks();
        }
      } else if (request.action === 'getKeywordDebug') {
        sendResponse(this.getKeywordStats());
      }
      return true;
    });
  }

  getCurrentStats() {
    const brandCount = document.querySelectorAll('.smart-link-brand').length;
    const techCount = document.querySelectorAll('.smart-link-tech').length;
    const businessCount = document.querySelectorAll('.smart-link-business').length;
    const highCount = document.querySelectorAll('.smart-link-high').length;
    const mediumCount = document.querySelectorAll('.smart-link-medium').length;
    
    return {
      brandCount,
      techCount,
      businessCount,
      keywordCount: highCount + mediumCount,
      totalCount: brandCount + techCount + businessCount + highCount + mediumCount,
      dynamicKeywordsFound: this.dynamicKeywords.size
    };
  }

  observeChanges() {
    // Watch for dynamic content changes with improved debouncing
    let reprocessTimeout;
    const observer = new MutationObserver((mutations) => {
      let shouldReprocess = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && 
              !node.classList.contains('smart-link-wrapper') &&
              node.textContent && node.textContent.trim().length > 10) {
            shouldReprocess = true;
          }
        });
      });
      
      if (shouldReprocess) {
        // Debounce reprocessing to avoid excessive calls
        clearTimeout(reprocessTimeout);
        reprocessTimeout = setTimeout(() => {
          console.log('🔄 Reprocessing page due to content changes...');
          this.processPage();
        }, 2000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.mutationObserver = observer;
  }

  removeAllLinks() {
    const smartLinks = document.querySelectorAll('.smart-link-wrapper');
    smartLinks.forEach(link => {
      const textNode = document.createTextNode(link.textContent);
      link.parentNode.replaceChild(textNode, link);
    });
    this.processedElements.clear();
    this.dynamicKeywords.clear();
    
    // Stop observing changes
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  }

  // Enhanced method to send analytics updates
  trackKeywordClick(keyword, type, score) {
    // Send analytics to background script or extension popup
    try {
      chrome.runtime.sendMessage({
        action: 'keywordClicked',
        keyword: keyword,
        type: type,
        score: score,
        url: window.location.href,
        timestamp: Date.now(),
        dynamicKeyword: this.dynamicKeywords.has(keyword.toLowerCase())
      });
    } catch (e) {
      // Ignore if extension context is not available
      console.log('Analytics tracking unavailable');
    }
  }');
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
      
      let match;
      while ((match = regex.exec(text)) !== null) {
        const isOverlapping = replacements.some(existing => 
          (match.index >= existing.start && match.index < existing.end) ||
          (match.index + match[0].length > existing.start && match.index < existing.end)
        );
        
        if (!isOverlapping) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            type: keyword.type,
            score: keyword.score
          });
        }
      }
    }

    return replacements.sort((a, b) => a.start - b.start);
  }

  replaceTextWithLinks(textNode, replacements) {
    const parent = textNode.parentNode;
    const originalText = textNode.textContent;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();

    replacements.forEach(replacement => {
      if (replacement.start > lastIndex) {
        const beforeText = originalText.substring(lastIndex, replacement.start);
        fragment.appendChild(document.createTextNode(beforeText));
      }

      const link = this.createSmartLink(replacement.text, replacement.type, replacement.score);
      fragment.appendChild(link);

      lastIndex = replacement.end;
    });

    if (lastIndex < originalText.length) {
      const afterText = originalText.substring(lastIndex);
      fragment.appendChild(document.createTextNode(afterText));
    }

    parent.replaceChild(fragment, textNode);
  }

  createSmartLink(text, type, score = 1) {
    const wrapper = document.createElement('span');
    
    let cssClass = 'smart-link-wrapper';
    if (type === 'brand') {
      cssClass += ' smart-link-brand';
    } else if (type === 'tech') {
      cssClass += ' smart-link-tech';  
    } else if (type === 'business') {
      cssClass += ' smart-link-business';
    } else if (type === 'high') {
      cssClass += ' smart-link-high';
    } else {
      cssClass += ' smart-link-medium';
    }
    
    wrapper.className = cssClass;
    wrapper.textContent = text;
    wrapper.title = `Click to search: ${text}`;
    wrapper.setAttribute('data-keyword', text);
    wrapper.setAttribute('data-score', Math.round(score));
    
    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      window.open(searchUrl, '_blank');
      
      this.trackKeywordClick(text, type, score);
    });

    return wrapper;
  }

  getCurrentStats() {
    const brandCount = document.querySelectorAll('.smart-link-brand').length;
    const techCount = document.querySelectorAll('.smart-link-tech').length;
    const businessCount = document.querySelectorAll('.smart-link-business').length;
    const highCount = document.querySelectorAll('.smart-link-high').length;
    const mediumCount = document.querySelectorAll('.smart-link-medium').length;
    
    return {
      brandCount,
      techCount,
      businessCount,
      keywordCount: highCount + mediumCount,
      totalCount: brandCount + techCount + businessCount + highCount + mediumCount,
      dynamicKeywordsFound: this.dynamicKeywords.size
    };
  }

  observeChanges() {
    let reprocessTimeout;
    const observer = new MutationObserver((mutations) => {
      let shouldReprocess = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && 
              !node.classList.contains('smart-link-wrapper') &&
              node.textContent && node.textContent.trim().length > 20) {
            shouldReprocess = true;
          }
        });
      });
      
      if (shouldReprocess) {
        clearTimeout(reprocessTimeout);
        reprocessTimeout = setTimeout(() => {
          console.log('🔄 Content changed, reprocessing...');
          this.processedElements.clear();
          this.processPage();
        }, 3000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.mutationObserver = observer;
  }

  removeAllLinks() {
    const smartLinks = document.querySelectorAll('.smart-link-wrapper');
    smartLinks.forEach(link => {
      const textNode = document.createTextNode(link.textContent);
      link.parentNode.replaceChild(textNode, link);
    });
    this.processedElements.clear();
    this.dynamicKeywords.clear();
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
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

  trackKeywordClick(keyword, type, score) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'keywordClicked',
          keyword: keyword,
          type: type,
          score: score,
          url: window.location.href,
          timestamp: Date.now()
        });
      }
    } catch (e) {
      console.log('Click tracking not available');
    }
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

  processPage() {
    console.log('🔍 Starting dynamic content analysis...');
    
    // Step 1: Build dynamic keyword library from page content
    this.buildDynamicKeywordLibrary();
    
    // Step 2: Extract and analyze the full content  
    const fullContent = this.extractPageContent();
    const keywords = this.analyzeContentWithDynamicKeywords(fullContent);
    
    console.log(`📊 Found ${keywords.length} keywords to link:`, keywords.slice(0, 10));
    
    // Step 3: Process text content in common content areas
    const selectors = [
      'article', 'main', '.content', '.post', '.article', 
      'p', 'div', 'span', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => this.processElement(element, keywords));
    });
    
    console.log(`✅ Processing complete. Dynamic keywords discovered:`, Array.from(this.dynamicKeywords.keys()).slice(0, 20));
  }

  buildDynamicKeywordLibrary() {
    console.log('🏗️ Building dynamic keyword library...');
    this.dynamicKeywords.clear();
    
    // Analyze different content sources with different weights
    const sources = [
      { elements: 'title', weight: 10, type: 'title' },
      { elements: 'h1', weight: 8, type: 'heading' },
      { elements: 'h2, h3', weight: 6, type: 'heading' },
      { elements: 'h4, h5, h6', weight: 4, type: 'heading' },
      { elements: 'img', weight: 5, type: 'image', attr: ['alt', 'title', 'src'] },
      { elements: 'figcaption, .caption, .image-caption', weight: 5, type: 'caption' },
      { elements: 'strong, b, em, mark', weight: 3, type: 'emphasis' },
      { elements: 'a', weight: 3, type: 'link', attr: ['title', 'href'] },
      { elements: '.brand, .company, .product', weight: 7, type: 'branded' },
      { elements: 'meta[name="keywords"]', weight: 6, type: 'meta', attr: ['content'] },
      { elements: 'meta[name="description"]', weight: 4, type: 'meta', attr: ['content'] },
      { elements: 'article, main, .content', weight: 1, type: 'content' }
    ];

    sources.forEach(source => {
      this.extractKeywordsFromSource(source);
    });

    // Analyze sentence beginnings for important terms
    this.analyzeSentenceBeginnings();
    
    // Filter and score the collected keywords
    this.scoreAndFilterKeywords();
  }

  extractKeywordsFromSource(source) {
    const elements = source.elements === 'title' ? 
      [document] : document.querySelectorAll(source.elements);
    
    Array.from(elements).forEach(element => {
      let texts = [];
      
      if (source.elements === 'title') {
        texts.push(document.title || '');
      } else if (source.attr) {
        // Extract from attributes
        source.attr.forEach(attr => {
          const value = element.getAttribute(attr);
          if (value) texts.push(value);
        });
        // Also get text content
        texts.push(element.textContent || '');
      } else {
        texts.push(element.textContent || '');
      }
      
      texts.forEach(text => {
        if (text && text.trim()) {
          this.extractAndWeightKeywords(text, source.weight, source.type);
        }
      });
    });
  }

  extractAndWeightKeywords(text, weight, sourceType) {
    // Extract different types of potential keywords
    const candidates = new Set();
    
    // 1. Capitalized words and phrases
    const capitalizedWords = text.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*\b/g) || [];
    capitalizedWords.forEach(word => candidates.add(word));
    
    // 2. Words with special characters (technical terms)
    const technicalTerms = text.match(/\b[a-zA-Z]+[._-][a-zA-Z]+(?:[._-][a-zA-Z]+)*\b/g) || [];
    technicalTerms.forEach(term => candidates.add(term));
    
    // 3. Quoted terms
    const quotedTerms = text.match(/"([^"]{3,30})"/g) || [];
    quotedTerms.forEach(quoted => candidates.add(quoted.replace(/"/g, '')));
    
    // 4. Terms in parentheses (often abbreviations or brands)
    const parenthesisTerms = text.match(/\(([A-Z]{2,}|[A-Z][a-zA-Z]{2,})\)/g) || [];
    parenthesisTerms.forEach(term => candidates.add(term.replace(/[()]/g, '')));
    
    // 5. All words for frequency analysis (filtered)
    const allWords = text.toLowerCase().match(/\b[a-zA-Z]{3,}\b/g) || [];
    allWords.forEach(word => {
      if (!this.stopWords.has(word) && this.isValidKeyword(word)) {
        candidates.add(word);
      }
    });
    
    // 6. Domain names from URLs
    const domains = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g) || [];
    domains.forEach(domain => {
      const cleanDomain = domain.replace(/https?:\/\//, '').replace(/www\./, '').split('.')[0];
      if (cleanDomain.length > 2) candidates.add(cleanDomain);
    });
    
    // Add to dynamic keywords with weighted scores
    candidates.forEach(candidate => {
      if (this.isValidKeyword(candidate)) {
        const key = candidate.toLowerCase();
        const existing = this.dynamicKeywords.get(key) || { text: candidate, score: 0, sources: new Set(), frequency: 0 };
        existing.score += weight;
        existing.frequency += 1;
        existing.sources.add(sourceType);
        this.dynamicKeywords.set(key, existing);
      }
    });
  }

  analyzeSentenceBeginnings() {
    // Find sentences and analyze their beginnings for important terms
    const contentElements = document.querySelectorAll('p, div, li, article, main');
    
    Array.from(contentElements).forEach(element => {
      const text = element.textContent || '';
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      
      sentences.forEach(sentence => {
        const trimmed = sentence.trim();
        // Look for capitalized words at sentence beginnings (excluding common sentence starters)
        const beginningWords = trimmed.match(/^([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*)/);
        
        if (beginningWords && beginningWords[1]) {
          const words = beginningWords[1].split(/\s+/);
          words.forEach(word => {
            if (word.length > 2 && !this.stopWords.has(word.toLowerCase()) && 
                !['The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What', 'How', 'Why', 'Who'].includes(word)) {
              
              const key = word.toLowerCase();
              const existing = this.dynamicKeywords.get(key) || { text: word, score: 0, sources: new Set(), frequency: 0 };
              existing.score += 2; // Sentence beginnings get moderate weight
              existing.frequency += 1;
              existing.sources.add('sentence-start');
              this.dynamicKeywords.set(key, existing);
            }
          });
        }
      });
    });
  }

  scoreAndFilterKeywords() {
    // Additional scoring based on patterns and characteristics
    for (const [key, data] of this.dynamicKeywords.entries()) {
      let bonusScore = 0;
      
      // Brand-like patterns
      if (/^[A-Z][a-zA-Z]*$/.test(data.text)) bonusScore += 2;
      if (data.text.length >= 6 && data.text.length <= 15) bonusScore += 1;
      if (/[A-Z]{2,}/.test(data.text)) bonusScore += 2; // Acronyms
      if (data.text.includes('.') || data.text.includes('-')) bonusScore += 2; // Technical terms
      
      // Multiple source bonus
      if (data.sources.size > 1) bonusScore += data.sources.size;
      
      // High frequency bonus
      if (data.frequency >= 3) bonusScore += Math.min(data.frequency, 10);
      
      // Seed keyword bonus
      if (this.seedKeywords.has(key)) bonusScore += 5;
      
      data.score += bonusScore;
    }
    
    // Remove low-scoring keywords
    for (const [key, data] of this.dynamicKeywords.entries()) {
      if (data.score < 2) {
        this.dynamicKeywords.delete(key);
      }
    }
  }

  analyzeContentWithDynamicKeywords(content) {
    // Combine dynamic keywords with traditional analysis
    const staticKeywords = this.traditionalContentAnalysis(content);
    const dynamicKeywords = Array.from(this.dynamicKeywords.values());
    
    // Merge and deduplicate
    const allKeywords = new Map();
    
    // Add dynamic keywords (higher priority)
    dynamicKeywords.forEach(keyword => {
      const key = keyword.text.toLowerCase();
      allKeywords.set(key, {
        text: keyword.text,
        score: keyword.score + 5, // Boost dynamic keywords
        type: this.categorizeDynamicKeyword(keyword),
        sources: keyword.sources,
        frequency: keyword.frequency
      });
    });
    
    // Add static keywords (lower priority, merge if exists)
    staticKeywords.forEach(keyword => {
      const key = keyword.text.toLowerCase();
      const existing = allKeywords.get(key);
      if (existing) {
        existing.score += keyword.score;
      } else {
        allKeywords.set(key, keyword);
      }
    });
    
    // Return top keywords sorted by score, limited to prevent overwhelming
    return Array.from(allKeywords.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 80) // Increased limit for more coverage
      .filter(k => k.score >= 3); // Minimum threshold
  }

  traditionalContentAnalysis(content) {
    const words = this.extractWords(content);
    const wordFreq = this.calculateWordFrequency(words);
    const keyphrases = this.extractKeyphrases(content);
    const namedEntities = this.extractNamedEntities(content);
    
    const keywords = new Map();
    
    // Add word frequencies (single words)
    for (const [word, freq] of wordFreq) {
      if (this.isValidKeyword(word) && freq >= 2) {
        keywords.set(word.toLowerCase(), {
          text: word,
          score: freq * this.getWordImportance(word),
          type: this.categorizeKeyword(word)
        });
      }
    }
    
    // Add keyphrases with higher scores
    for (const phrase of keyphrases) {
      const key = phrase.toLowerCase();
      const score = (keywords.get(key)?.score || 0) + 5;
      keywords.set(key, {
        text: phrase,
        score: score,
        type: this.categorizeKeyword(phrase)
      });
    }
    
    // Add named entities with highest scores
    for (const entity of namedEntities) {
      const key = entity.toLowerCase();
      const score = (keywords.get(key)?.score || 0) + 10;
      keywords.set(key, {
        text: entity,
        score: score,
        type: 'entity'
      });
    }
    
    return Array.from(keywords.values());
  }

  categorizeDynamicKeyword(keyword) {
    const text = keyword.text.toLowerCase();
    const sources = Array.from(keyword.sources);
    
    // Brand/Entity detection
    if (sources.includes('title') || sources.includes('heading') || 
        sources.includes('branded') || keyword.frequency >= 5) {
      return 'brand';
    }
    
    // Technical terms
    if (text.includes('.') || text.includes('-') || text.includes('_') ||
        /(?:api|sdk|js|css|html|json|xml|sql|http|tcp|ssl|cdn|dns)/.test(text)) {
      return 'tech';
    }
    
    // Business terms
    if (/(?:saas|crm|erp|roi|seo|b2b|startup|platform|service)/.test(text)) {
      return 'business';
    }
    
    // High importance if multiple sources or high frequency
    if (sources.length >= 3 || keyword.frequency >= 4) {
      return 'high';
    }
    
    // Medium importance for everything else
    return 'medium';
  }

  extractPageContent() {
    // Extract text from main content areas
    const contentSelectors = ['article', 'main', '.content', '.post', '[role="main"]', '.entry-content'];
    let content = '';
    
    // Try to find main content area first
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        content = element.textContent || element.innerText || '';
        break;
      }
    }
    
    // Fallback to body content if no main content found
    if (!content) {
      content = document.body.textContent || document.body.innerText || '';
    }
    
    // Include title and headings with higher weight
    const title = document.title || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent || '')
      .join(' ');
    
    // Weight title and headings more heavily
    return `${title} ${title} ${headings} ${headings} ${content}`;
  }

  isValidKeyword(word) {
    if (typeof word !== 'string') return false;
    
    const cleanWord = word.trim();
    
    return cleanWord.length >= 3 && 
           cleanWord.length <= 35 && 
           !this.stopWords.has(cleanWord.toLowerCase()) &&
           !/^[\d\s\-_.,]+$/.test(cleanWord) && // Not just numbers/punctuation
           /[a-zA-Z]/.test(cleanWord) && // Contains at least one letter
           !/^(https?|www|com|org|net|edu|gov)$/i.test(cleanWord) && // Not common web terms
           !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)$/i.test(cleanWord); // Not months
  }

  extractKeyphrases(text) {
    const phrases = [];
    
    // Look for capitalized phrases (potential proper nouns)
    const capitalizedPhrases = text.match(/[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+/g) || [];
    phrases.push(...capitalizedPhrases);
    
    // Look for technical terms with dots, hyphens, or camelCase
    const technicalTerms = text.match(/[a-zA-Z]+[.-][a-zA-Z]+(?:[.-][a-zA-Z]+)*/g) || [];
    phrases.push(...technicalTerms);
    
    // Look for quoted terms
    const quotedTerms = text.match(/"([^"]+)"/g) || [];
    phrases.push(...quotedTerms.map(q => q.replace(/"/g, '')));
    
    // Look for terms in code blocks or backticks
    const codeTerms = text.match(/`([^`]+)`/g) || [];
    phrases.push(...codeTerms.map(c => c.replace(/`/g, '')));
    
    return [...new Set(phrases)]
      .filter(phrase => phrase.length > 2 && phrase.length < 50)
      .slice(0, 20);
  }

  extractNamedEntities(text) {
    const entities = [];
    
    // Look for known entities (case insensitive)
    for (const entity of this.knownEntities) {
      const regex = new RegExp(`\\b${entity}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        entities.push(...matches);
      }
    }
    
    // Look for potential company names (capitalized words ending in Corp, Inc, LLC, etc.)
    const companyPatterns = [
      /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Technologies|Tech|Systems|Software|Solutions)\b/g,
      /\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:API|SDK|CRM|ERP|SaaS|AI|ML)\b/g
    ];
    
    companyPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      entities.push(...matches);
    });
    
    // Look for URLs and extract domain names
    const urls = text.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g) || [];
    urls.forEach(url => {
      const domain = url.match(/https?:\/\/(?:www\.)?([a-zA-Z0-9-]+)\./);
      if (domain && domain[1]) {
        entities.push(domain[1]);
      }
    });
    
    return [...new Set(entities)].slice(0, 15);
  }

  isValidKeyword(word) {
    return word.length >= 3 && 
           word.length <= 30 && 
           !this.stopWords.has(word.toLowerCase()) &&
           !/^\d+$/.test(word) && // Not just numbers
           /[a-zA-Z]/.test(word); // Contains at least one letter
  }

  getWordImportance(word) {
    const lowerWord = word.toLowerCase();
    
    // Higher importance for known entities
    if (this.knownEntities.has(lowerWord)) return 3;
    
    // Higher importance for capitalized words
    if (word[0] === word[0].toUpperCase()) return 2;
    
    // Higher importance for technical-looking terms
    if (/[A-Z]/.test(word) || /[\.-]/.test(word)) return 1.5;
    
    return 1;
  }

  categorizeKeyword(keyword) {
    const lower = keyword.toLowerCase();
    
    // Tech terms
    if (/(?:js|css|html|api|sdk|sql|json|xml|http|tcp|udp|rest|graphql|oauth|jwt|cdn|dns|ssl|tls|vpn|aws|gcp|azure)/.test(lower) ||
        /(?:javascript|python|java|react|angular|vue|node|docker|kubernetes|mongodb|postgresql|mysql|redis|nginx|apache)/.test(lower)) {
      return 'tech';
    }
    
    // Business terms
    if (/(?:saas|crm|erp|kpi|roi|seo|sem|ppc|ctr|b2b|b2c|api|startup|unicorn|ipo|vc)/.test(lower)) {
      return 'business';
    }
    
    // Brands/Companies
    if (this.knownEntities.has(lower) || /(?:inc|corp|llc|ltd|company|technologies|tech|systems|software|solutions)/.test(lower)) {
      return 'brand';
    }
    
    return 'keyword';
  }

  processElement(element, keywords) {
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
      const replacements = this.findKeywordMatches(originalText, keywords);

      if (replacements.length > 0) {
        this.replaceTextWithLinks(textNode, replacements);
      }
    });

    this.processedElements.add(element);
  }

  findKeywordMatches(text, keywords) {
    const replacements = [];
    
    // Sort keywords by length (longest first) to avoid partial matches
    const sortedKeywords = keywords.sort((a, b) => b.text.length - a.text.length);
    
    for (const keyword of sortedKeywords) {
      // Create regex for whole word matching
      const escapedKeyword = keyword.text.replace(/[.*+?^${}()|[\]\\]/g, '\\  processElement(element) {
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
  }');
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
      
      let match;
      while ((match = regex.exec(text)) !== null) {
        // Check if this position is already covered by another replacement
        const isOverlapping = replacements.some(existing => 
          (match.index >= existing.start && match.index < existing.end) ||
          (match.index + match[0].length > existing.start && match.index < existing.end)
        );
        
        if (!isOverlapping) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            type: keyword.type,
            score: keyword.score
          });
        }
      }
    }

    // Sort by position and remove any remaining overlaps
    replacements.sort((a, b) => a.start - b.start);
    return this.removeOverlaps(replacements);
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

  createSmartLink(text, type, score = 1) {
    const wrapper = document.createElement('span');
    
    // Determine CSS class based on type and score
    let cssClass = 'smart-link-wrapper';
    if (type === 'brand' || type === 'entity') {
      cssClass += ' smart-link-brand';
    } else if (type === 'tech') {
      cssClass += ' smart-link-tech';  
    } else if (type === 'business') {
      cssClass += ' smart-link-business';
    } else {
      // Dynamic keyword - use intensity based on score
      cssClass += score > 5 ? ' smart-link-high' : ' smart-link-medium';
    }
    
    wrapper.className = cssClass;
    wrapper.textContent = text;
    wrapper.title = `Click to search: ${text}`;
    wrapper.setAttribute('data-keyword', text);
    wrapper.setAttribute('data-score', score);
    
    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      window.open(searchUrl, '_blank');
      
      // Track click for analytics
      this.trackKeywordClick(text, type, score);
    });

    return wrapper;
  }

  trackKeywordClick(keyword, type, score) {
    // Send analytics to background script or extension popup
    try {
      chrome.runtime.sendMessage({
        action: 'keywordClicked',
        keyword: keyword,
        type: type,
        score: score,
        url: window.location.href
      });
    } catch (e) {
      // Ignore if extension context is not available
    }
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