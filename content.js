// Content script that runs on all pages
class SmartLinkCreator {
  constructor() {
    this.isEnabled = true;
    this.processedElements = new Set();
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it', 
      'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with', 'would', 'you', 'your', 'this', 
      'they', 'we', 'can', 'had', 'her', 'his', 'she', 'or', 'but', 'not', 'what', 'all', 'any', 
      'been', 'their', 'said', 'each', 'which', 'do', 'how', 'if', 'up', 'out', 'many', 'then', 
      'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'into', 'him', 'time', 'has',
      'two', 'more', 'very', 'when', 'come', 'may', 'get', 'use', 'man', 'new', 'now', 'old', 'see',
      'way', 'who', 'boy', 'did', 'number', 'no', 'could', 'people', 'my', 'than', 'first', 'been',
      'call', 'work', 'made', 'after', 'back', 'other', 'good', 'go', 'write', 'where', 'much', 'take',
      'why', 'help', 'put', 'end', 'try', 'ask', 'turn', 'move', 'live', 'year', 'place', 'over'
    ]);
    
    // Known entities that should always be linked
    this.knownEntities = new Set([
      'google', 'microsoft', 'apple', 'amazon', 'facebook', 'meta', 'netflix', 'tesla', 'spotify', 
      'adobe', 'salesforce', 'oracle', 'ibm', 'intel', 'amd', 'nvidia', 'samsung', 'react', 'vue',
      'angular', 'javascript', 'python', 'java', 'nodejs', 'docker', 'kubernetes', 'api', 'mysql',
      'postgresql', 'mongodb', 'redis', 'aws', 'azure', 'gcp', 'github', 'gitlab', 'slack', 'zoom',
      'figma', 'notion', 'trello', 'asana', 'shopify', 'wordpress', 'stripe', 'paypal'
    ]);

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
    // First, extract and analyze the full content
    const fullContent = this.extractPageContent();
    const keywords = this.analyzeContent(fullContent);
    
    // Process text content in common content areas
    const selectors = [
      'article', 'main', '.content', '.post', '.article', 
      'p', 'div', 'span', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => this.processElement(element, keywords));
    });
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

  analyzeContent(content) {
    const words = this.extractWords(content);
    const wordFreq = this.calculateWordFrequency(words);
    const keyphrases = this.extractKeyphrases(content);
    const namedEntities = this.extractNamedEntities(content);
    
    // Combine and score all potential keywords
    const allKeywords = new Map();
    
    // Add word frequencies (single words)
    for (const [word, freq] of wordFreq) {
      if (this.isValidKeyword(word) && freq >= 2) {
        allKeywords.set(word.toLowerCase(), {
          text: word,
          score: freq * this.getWordImportance(word),
          type: this.categorizeKeyword(word)
        });
      }
    }
    
    // Add keyphrases with higher scores
    for (const phrase of keyphrases) {
      const key = phrase.toLowerCase();
      const score = (allKeywords.get(key)?.score || 0) + 5;
      allKeywords.set(key, {
        text: phrase,
        score: score,
        type: this.categorizeKeyword(phrase)
      });
    }
    
    // Add named entities with highest scores
    for (const entity of namedEntities) {
      const key = entity.toLowerCase();
      const score = (allKeywords.get(key)?.score || 0) + 10;
      allKeywords.set(key, {
        text: entity,
        score: score,
        type: 'entity'
      });
    }
    
    // Return top keywords sorted by score
    return Array.from(allKeywords.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Limit to top 50 keywords
  }

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