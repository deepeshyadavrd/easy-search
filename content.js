// Content script that runs on all pages
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
    
    const candidates = new Set();
    
    // 1. Multi-word phrases (2-4 words) - PRIORITY
    const phrases = this.extractMeaningfulPhrases(text);
    phrases.forEach(phrase => candidates.add(phrase));
    
    // 2. Capitalized words and phrases (brands, proper nouns)
    const capitalizedWords = text.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3}\b/g) || [];
    capitalizedWords.forEach(word => candidates.add(word.trim()));
    
    // 3. Technical terms with special characters
    const technicalTerms = text.match(/\b[a-zA-Z]+[._-][a-zA-Z]+(?:[._-][a-zA-Z]+)*\b/g) || [];
    technicalTerms.forEach(term => candidates.add(term));
    
    // 4. Quoted terms (often important multi-word concepts)
    const quotedTerms = text.match(/"([^"]{3,30})"/g) || [];
    quotedTerms.forEach(quoted => {
      const clean = quoted.replace(/"/g, '').trim();
      if (clean.length >= 3) candidates.add(clean);
    });
    
    // 5. Terms in parentheses
    const parenthesisTerms = text.match(/\(([A-Z]{2,}|[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})?)\)/g) || [];
    parenthesisTerms.forEach(term => {
      const clean = term.replace(/[()]/g, '').trim();
      if (clean.length >= 2) candidates.add(clean);
    });
    
    // 6. Company/Product patterns
    const companyPatterns = this.extractCompanyPatterns(text);
    companyPatterns.forEach(pattern => candidates.add(pattern));
    
    // 7. For content analysis, get frequent single words (lower priority)
    if (source === 'content') {
      const words = text.toLowerCase().match(/\b[a-zA-Z]{4,}\b/g) || [];
      const wordCount = new Map();
      
      words.forEach(word => {
        if (!this.stopWords.has(word)) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }
      });
      
      for (const [word, count] of wordCount.entries()) {
        if (count >= 4) { // Higher threshold for single words
          candidates.add(word);
        }
      }
    }
    
    // Add candidates to dynamic keywords with phrase bonus
    candidates.forEach(candidate => {
      if (this.isValidKeyword(candidate)) {
        const key = candidate.toLowerCase();
        const existing = this.dynamicKeywords.get(key) || {
          text: candidate,
          score: 0,
          sources: new Set(),
          frequency: 0,
          isPhrase: candidate.includes(' ')
        };
        
        // Bonus for multi-word phrases
        const phraseBonus = candidate.includes(' ') ? 3 : 0;
        existing.score += weight + phraseBonus;
        existing.frequency += 1;
        existing.sources.add(source);
        this.dynamicKeywords.set(key, existing);
      }
    });
  }

  extractMeaningfulPhrases(text) {
    const phrases = new Set();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    sentences.forEach(sentence => {
      const cleanSentence = sentence.trim();
      
      // Pattern 1: "done by [Brand/Tool]", "using [Tool]", "with [Platform]" etc.
      const contextPatterns = [
        /(?:done by|using|with|via|through|powered by|built on|made with|created using|developed with|based on)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/gi,
        /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:platform|service|tool|software|system|solution|application|framework|library)/gi,
        /(?:the|our|their)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:platform|service|tool|software|system|solution|application|API|SDK)/gi
      ];
      
      contextPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanSentence)) !== null) {
          const phrase = match[1].trim();
          if (phrase && phrase.length >= 3) {
            phrases.add(phrase);
          }
        }
      });
      
      // Pattern 2: Common business/tech combinations
      const businessTechPatterns = [
        /\b([A-Z][a-zA-Z]+)\s+(CRM|ERP|API|SDK|CMS|SaaS|AI|ML|BI|HR|CX|UX|UI)\b/gi,
        /\b([A-Z][a-zA-Z]+)\s+(Analytics|Dashboard|Platform|Service|Cloud|Software|Solutions|Technologies|Systems)\b/gi,
        /\b(Google|Microsoft|Amazon|Apple|Facebook|Meta|Adobe|Oracle|Salesforce|HubSpot|Slack|Zoom|Shopify|WordPress|GitHub|GitLab)\s+([A-Z][a-zA-Z]+)\b/gi
      ];
      
      businessTechPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanSentence)) !== null) {
          const phrase = `${match[1]} ${match[2]}`.trim();
          if (phrase && phrase.length >= 3) {
            phrases.add(phrase);
          }
        }
      });
      
      // Pattern 3: Technology stack combinations
      const techStackPatterns = [
        /\b(React|Vue|Angular|Node|Python|Java|PHP|Ruby|Next)\s+(Native|JS|Express|Django|Flask|Spring|Laravel|Rails)\b/gi,
        /\b(Amazon|Google|Microsoft)\s+(AWS|S3|EC2|GCP|Azure|Office|Teams|Drive|Docs|Sheets)\b/gi,
        /\b(Machine|Deep|Artificial)\s+(Learning|Intelligence|Neural)\b/gi
      ];
      
      techStackPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanSentence)) !== null) {
          const phrase = `${match[1]} ${match[2]}`.trim();
          phrases.add(phrase);
        }
      });
      
      // Pattern 4: Sequential capitalized words (likely brand names)
      const capitalSequences = cleanSentence.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){1,2}\b/g) || [];
      capitalSequences.forEach(seq => {
        const words = seq.split(/\s+/);
        if (words.length >= 2 && words.length <= 3) {
          // Check if it's not just common words
          const hasCommonWord = words.some(word => 
            ['The', 'This', 'That', 'And', 'Or', 'But', 'For', 'With', 'From', 'To', 'Of', 'In', 'On', 'At', 'By'].includes(word)
          );
          if (!hasCommonWord) {
            phrases.add(seq.trim());
          }
        }
      });
      
      // Pattern 5: Words ending with common business/tech suffixes
      const suffixPatterns = [
        /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:Inc|Corp|LLC|Ltd|Company|Technologies|Tech|Labs|Solutions|Systems|Software|Services|Group|Enterprises)\b/gi
      ];
      
      suffixPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(cleanSentence)) !== null) {
          const phrase = match[0].trim();
          if (phrase.length <= 30) {
            phrases.add(phrase);
          }
        }
      });
    });
    
    return Array.from(phrases).filter(phrase => 
      phrase.length >= 3 && 
      phrase.length <= 30 && 
      phrase.split(/\s+/).length <= 4
    );
  }

  extractCompanyPatterns(text) {
    const companies = [];
    
    // Look for common company/product naming patterns
    const patterns = [
      // Brand + descriptor
      /\b([A-Z][a-zA-Z]{3,})\s+(Analytics|Dashboard|Platform|Cloud|Software|Solutions|CRM|ERP|API|SDK|Teams)\b/gi,
      // Descriptor + Brand
      /\b(Microsoft|Google|Amazon|Apple|Meta|Facebook|Adobe|Oracle|Salesforce|IBM|Intel|NVIDIA)\s+([A-Z][a-zA-Z]{2,})\b/gi,
      // Two-word brands
      /\b([A-Z][a-zA-Z]{3,})\s+([A-Z][a-zA-Z]{3,})\b(?=\s+(?:is|was|has|can|will|provides|offers|enables|helps|allows|makes|creates|builds|develops))/gi
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] && match[2]) {
          companies.push(`${match[1]} ${match[2]}`.trim());
        }
      }
    });
    
    return companies;
  }

  isValidKeyword(word) {
    if (!word || typeof word !== 'string') return false;
    
    const clean = word.trim();
    const words = clean.split(/\s+/);
    
    // For phrases (multi-word)
    if (words.length > 1) {
      // Check each word in the phrase
      const hasValidWords = words.every(w => 
        w.length >= 2 && 
        !this.stopWords.has(w.toLowerCase()) &&
        /[a-zA-Z]/.test(w)
      );
      
      // Additional phrase validation
      const validPhraseLength = clean.length >= 5 && clean.length <= 35;
      const notAllCommonWords = words.some(w => !this.stopWords.has(w.toLowerCase()));
      const hasCapitalizedWord = words.some(w => /^[A-Z]/.test(w));
      
      return hasValidWords && validPhraseLength && notAllCommonWords && hasCapitalizedWord;
    }
    
    // For single words (existing logic)
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
      .sort((a, b) => {
        // Prioritize phrases over single words
        if (a.isPhrase && !b.isPhrase) return -1;
        if (!a.isPhrase && b.isPhrase) return 1;
        // Then sort by score
        return b.score - a.score;
      })
      .slice(0, 60) // Increased limit for more phrase coverage
      .map(k => ({
        text: k.text,
        score: k.score,
        type: this.categorizeKeyword(k),
        isPhrase: k.isPhrase
      }));
    
    // Log phrases for debugging
    const phrases = keywords.filter(k => k.isPhrase);
    if (phrases.length > 0) {
      console.log(`🎯 Found ${phrases.length} phrases:`, phrases.slice(0, 10).map(p => `"${p.text}"`));
    }
    
    return keywords;
  }

  categorizeKeyword(keyword) {
    const text = keyword.text.toLowerCase();
    const sources = Array.from(keyword.sources);
    const isPhrase = keyword.isPhrase || keyword.text.includes(' ');
    
    // Phrases get higher priority categorization
    if (isPhrase) {
      // Technology combinations
      if (/(?:api|sdk|crm|erp|cms|saas|ai|ml|bi|hr|analytics|dashboard|platform|cloud|software|solutions|technologies|systems|teams)/.test(text)) {
        return 'tech';
      }
      
      // Business tools and platforms
      if (/(?:service|platform|solution|business|company|startup|market|sales|revenue|management|analytics|dashboard|teams)/.test(text)) {
        return 'business';
      }
      
      // Brand combinations (company names, products)
      if (sources.includes('title') || sources.includes('heading') || keyword.frequency >= 3) {
        return 'brand';
      }
      
      // High importance for multi-word terms with good scores
      if (keyword.score >= 8) {
        return 'high';
      }
      
      return 'medium';
    }
    
    // Single word categorization (existing logic)
    if (sources.includes('title') || sources.includes('heading')) {
      return 'brand';
    }
    
    if (text.includes('.') || text.includes('-') || text.includes('_') ||
        /(?:api|sdk|js|css|html|json|xml|sql|http|app|web|mobile|cloud|data|tech)/.test(text)) {
      return 'tech';
    }
    
    if (/(?:service|platform|solution|business|company|startup|market|sales|revenue)/.test(text)) {
      return 'business';
    }
    
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
    
    // Sort keywords: phrases first (by length), then single words
    const phraseKeywords = keywords.filter(k => k.text.includes(' ')).sort((a, b) => b.text.length - a.text.length);
    const singleKeywords = keywords.filter(k => !k.text.includes(' ')).sort((a, b) => b.text.length - a.text.length);
    const sortedKeywords = [...phraseKeywords, ...singleKeywords];
    
    console.log(`🔍 Searching for ${phraseKeywords.length} phrases and ${singleKeywords.length} single words`);
    
    for (const keyword of sortedKeywords) {
      const escapedKeyword = keyword.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // For phrases, use word boundary at start and end
      // For single words, use stricter word boundary
      const regex = keyword.text.includes(' ') 
        ? new RegExp(`\\b${escapedKeyword}\\b`, 'gi')
        : new RegExp(`\\b${escapedKeyword}\\b(?![a-zA-Z])`, 'gi');
      
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
            score: keyword.score,
            isPhrase: keyword.text.includes(' ')
          });
          
          // Log phrase matches for debugging
          if (keyword.text.includes(' ')) {
            console.log(`✅ Found phrase: "${match[0]}" (${keyword.type})`);
          }
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