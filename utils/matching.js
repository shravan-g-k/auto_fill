/**
 * AutoFill Pro — Field Matching Engine
 * Intelligent form field detection using attribute matching, label reading, and context heuristics.
 */

const AutoFillMatcher = (() => {

  /**
   * Keyword dictionary: maps profile data keys to regex patterns
   * that match common field names/labels/placeholders
   */
  const FIELD_PATTERNS = {
    firstName: {
      patterns: [
        /first[\s_-]?name/i, /fname/i, /given[\s_-]?name/i,
        /^first$/i, /forename/i, /name[\s_-]?first/i,
        /applicant[\s_-]?first/i
      ],
      autocomplete: ['given-name'],
      inputTypes: ['text']
    },
    lastName: {
      patterns: [
        /last[\s_-]?name/i, /lname/i, /sur[\s_-]?name/i,
        /family[\s_-]?name/i, /^last$/i, /name[\s_-]?last/i,
        /applicant[\s_-]?last/i
      ],
      autocomplete: ['family-name'],
      inputTypes: ['text']
    },
    fullName: {
      patterns: [
        /full[\s_-]?name/i, /^name$/i, /your[\s_-]?name/i,
        /complete[\s_-]?name/i, /display[\s_-]?name/i,
        /applicant[\s_-]?name/i, /candidate[\s_-]?name/i
      ],
      autocomplete: ['name'],
      inputTypes: ['text']
    },
    email: {
      patterns: [
        /e[\s_-]?mail/i, /email[\s_-]?addr/i, /mail/i,
        /electronic[\s_-]?mail/i
      ],
      autocomplete: ['email'],
      inputTypes: ['email', 'text']
    },
    phone: {
      patterns: [
        /phone/i, /tel/i, /mobile/i, /cell/i,
        /contact[\s_-]?number/i, /phone[\s_-]?number/i,
        /mobile[\s_-]?number/i, /telephone/i
      ],
      autocomplete: ['tel', 'tel-national'],
      inputTypes: ['tel', 'text', 'number']
    },
    dob: {
      patterns: [
        /date[\s_-]?of[\s_-]?birth/i, /birth[\s_-]?date/i,
        /dob/i, /birthday/i, /born/i
      ],
      autocomplete: ['bday'],
      inputTypes: ['date', 'text']
    },
    street: {
      patterns: [
        /street/i, /address[\s_-]?1/i, /addr[\s_-]?1/i,
        /address[\s_-]?line/i, /street[\s_-]?addr/i,
        /mailing[\s_-]?address/i, /^address$/i,
        /home[\s_-]?address/i, /residential/i
      ],
      autocomplete: ['street-address', 'address-line1'],
      inputTypes: ['text']
    },
    city: {
      patterns: [
        /city/i, /town/i, /locality/i, /municipality/i
      ],
      autocomplete: ['address-level2'],
      inputTypes: ['text']
    },
    state: {
      patterns: [
        /state/i, /province/i, /region/i, /territory/i
      ],
      autocomplete: ['address-level1'],
      inputTypes: ['text']
    },
    zip: {
      patterns: [
        /zip/i, /postal/i, /post[\s_-]?code/i, /pin[\s_-]?code/i
      ],
      autocomplete: ['postal-code'],
      inputTypes: ['text', 'number']
    },
    country: {
      patterns: [
        /country/i, /nation/i
      ],
      autocomplete: ['country', 'country-name'],
      inputTypes: ['text']
    },
    company: {
      patterns: [
        /company/i, /employer/i, /organization/i, /organisation/i,
        /current[\s_-]?company/i, /firm/i, /workplace/i
      ],
      autocomplete: ['organization'],
      inputTypes: ['text']
    },
    jobTitle: {
      patterns: [
        /job[\s_-]?title/i, /position/i, /role/i, /designation/i,
        /current[\s_-]?title/i, /current[\s_-]?position/i,
        /current[\s_-]?role/i
      ],
      autocomplete: ['organization-title'],
      inputTypes: ['text']
    },
    linkedin: {
      patterns: [
        /linkedin/i, /linked[\s_-]?in/i, /li[\s_-]?url/i,
        /linkedin[\s_-]?profile/i, /linkedin[\s_-]?url/i
      ],
      autocomplete: [],
      inputTypes: ['text', 'url']
    },
    university: {
      patterns: [
        /university/i, /college/i, /school/i, /institution/i,
        /alma[\s_-]?mater/i, /education/i
      ],
      autocomplete: [],
      inputTypes: ['text']
    },
    degree: {
      patterns: [
        /degree/i, /qualification/i, /diploma/i, /certification/i,
        /course/i, /program/i, /major/i
      ],
      autocomplete: [],
      inputTypes: ['text']
    },
    gradYear: {
      patterns: [
        /grad[\s_-]?year/i, /graduation[\s_-]?year/i, /year[\s_-]?of[\s_-]?graduation/i,
        /passing[\s_-]?year/i, /completion[\s_-]?year/i, /class[\s_-]?of/i
      ],
      autocomplete: [],
      inputTypes: ['text', 'number']
    },
    gpa: {
      patterns: [
        /gpa/i, /cgpa/i, /grade[\s_-]?point/i, /percentage/i,
        /score/i, /marks/i
      ],
      autocomplete: [],
      inputTypes: ['text', 'number']
    },
    website: {
      patterns: [
        /website/i, /web[\s_-]?site/i, /homepage/i, /portfolio/i,
        /personal[\s_-]?url/i, /personal[\s_-]?website/i, /^url$/i
      ],
      autocomplete: ['url'],
      inputTypes: ['url', 'text']
    }
  };

  /**
   * Get all text attributes from a field element
   */
  function getFieldAttributes(field) {
    return {
      name: (field.getAttribute('name') || '').toLowerCase(),
      id: (field.getAttribute('id') || '').toLowerCase(),
      type: (field.getAttribute('type') || '').toLowerCase(),
      placeholder: (field.getAttribute('placeholder') || '').toLowerCase(),
      autocomplete: (field.getAttribute('autocomplete') || '').toLowerCase(),
      ariaLabel: (field.getAttribute('aria-label') || '').toLowerCase(),
      title: (field.getAttribute('title') || '').toLowerCase(),
      className: (field.className || '').toLowerCase(),
      dataField: (field.dataset.field || field.dataset.name || field.dataset.type || '').toLowerCase()
    };
  }

  /**
   * Strategy A: Match field attributes against keyword patterns
   * Returns { fieldKey, confidence } or null
   */
  function matchByAttributes(field) {
    const attrs = getFieldAttributes(field);
    const searchableText = [
      attrs.name, attrs.id, attrs.placeholder,
      attrs.ariaLabel, attrs.title, attrs.className, attrs.dataField
    ].join(' ');

    let bestMatch = null;
    let bestConfidence = 0;

    for (const [fieldKey, config] of Object.entries(FIELD_PATTERNS)) {
      // Check autocomplete attribute first (highest confidence)
      if (attrs.autocomplete && config.autocomplete.includes(attrs.autocomplete)) {
        return { fieldKey, confidence: 1.0, strategy: 'attribute-autocomplete' };
      }

      // Check patterns against name and id (high confidence)
      for (const pattern of config.patterns) {
        if (pattern.test(attrs.name) || pattern.test(attrs.id)) {
          const confidence = 0.95;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = { fieldKey, confidence, strategy: 'attribute-name-id' };
          }
        }
        // Check placeholder and aria-label (medium confidence)
        if (pattern.test(attrs.placeholder) || pattern.test(attrs.ariaLabel)) {
          const confidence = 0.8;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = { fieldKey, confidence, strategy: 'attribute-placeholder' };
          }
        }
        // Check class and data attributes (lower confidence)
        if (pattern.test(attrs.className) || pattern.test(attrs.dataField)) {
          const confidence = 0.6;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = { fieldKey, confidence, strategy: 'attribute-class' };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Find associated label text for a field
   */
  function getLabelText(field) {
    const texts = [];

    // Method 1: Explicit <label for="fieldId">
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) texts.push(label.textContent.trim().toLowerCase());
    }

    // Method 2: Wrapping <label> parent
    const parentLabel = field.closest('label');
    if (parentLabel) {
      const labelText = parentLabel.textContent.replace(field.value || '', '').trim().toLowerCase();
      texts.push(labelText);
    }

    // Method 3: Previous sibling label
    let prev = field.previousElementSibling;
    while (prev && !['LABEL', 'SPAN', 'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(prev.tagName)) {
      prev = prev.previousElementSibling;
    }
    if (prev && prev.textContent.trim().length < 100) {
      texts.push(prev.textContent.trim().toLowerCase());
    }

    // Method 4: aria-labelledby
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) texts.push(labelEl.textContent.trim().toLowerCase());
    }

    // Method 5: Parent container text (for div-wrapped labels)
    const parent = field.parentElement;
    if (parent) {
      const parentText = Array.from(parent.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && n !== field && ['LABEL', 'SPAN', 'P'].includes(n.tagName)))
        .map(n => n.textContent.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length < 80)
        .join(' ');
      if (parentText) texts.push(parentText);
    }

    return texts;
  }

  /**
   * Strategy B: Match using nearby label text
   * Returns { fieldKey, confidence } or null
   */
  function matchByLabel(field) {
    const labelTexts = getLabelText(field);
    if (labelTexts.length === 0) return null;

    const combinedText = labelTexts.join(' ');
    let bestMatch = null;
    let bestConfidence = 0;

    for (const [fieldKey, config] of Object.entries(FIELD_PATTERNS)) {
      for (const pattern of config.patterns) {
        if (pattern.test(combinedText)) {
          const confidence = 0.75;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = { fieldKey, confidence, strategy: 'label' };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Strategy C: Context heuristics (field type + position)
   * Returns { fieldKey, confidence } or null
   */
  function matchByContext(field, formFields, index) {
    const type = (field.getAttribute('type') || 'text').toLowerCase();
    const tag = field.tagName.toLowerCase();

    // Email type is unambiguous
    if (type === 'email') {
      return { fieldKey: 'email', confidence: 0.9, strategy: 'context-type' };
    }

    // Tel type is unambiguous
    if (type === 'tel') {
      return { fieldKey: 'phone', confidence: 0.9, strategy: 'context-type' };
    }

    // URL type
    if (type === 'url') {
      // Check page context for linkedin
      const pageText = document.title.toLowerCase() + ' ' + (document.querySelector('h1')?.textContent || '').toLowerCase();
      if (/linkedin|job|career|application/i.test(pageText)) {
        return { fieldKey: 'linkedin', confidence: 0.5, strategy: 'context-page' };
      }
      return { fieldKey: 'website', confidence: 0.5, strategy: 'context-type' };
    }

    // Date type
    if (type === 'date') {
      const attrs = getFieldAttributes(field);
      const allText = Object.values(attrs).join(' ');
      if (/birth|dob|born/i.test(allText)) {
        return { fieldKey: 'dob', confidence: 0.7, strategy: 'context-date' };
      }
    }

    // First text field in a form is often the name
    if (type === 'text' && index === 0 && formFields.length >= 3) {
      return { fieldKey: 'fullName', confidence: 0.3, strategy: 'context-position' };
    }

    return null;
  }

  /**
   * Main matching function: run all 3 strategies and return best match
   * @param {HTMLElement} field - The form field element
   * @param {HTMLElement[]} formFields - All fields in the same form
   * @param {number} index - This field's index in the form
   * @returns {{ fieldKey: string, confidence: number, strategy: string } | null}
   */
  function matchField(field, formFields = [], index = 0) {
    // Skip hidden, submit, button, checkbox, radio fields
    const type = (field.getAttribute('type') || '').toLowerCase();
    const skipTypes = ['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'image', 'file', 'range', 'color'];
    if (skipTypes.includes(type)) return null;

    // Skip if field is not visible
    if (field.offsetParent === null && field.getAttribute('type') !== 'hidden') return null;

    // Run strategies in priority order
    const attrMatch = matchByAttributes(field);
    if (attrMatch && attrMatch.confidence >= 0.8) return attrMatch;

    const labelMatch = matchByLabel(field);
    if (labelMatch && labelMatch.confidence >= 0.7) return labelMatch;

    // If attribute match exists but lower confidence, prefer it over context
    if (attrMatch && attrMatch.confidence >= 0.5) return attrMatch;

    const contextMatch = matchByContext(field, formFields, index);

    // Return the best match among remaining
    const candidates = [attrMatch, labelMatch, contextMatch].filter(Boolean);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0];
  }

  /**
   * Check if a field is a file upload input
   */
  function isFileInput(field) {
    return field.tagName === 'INPUT' && field.getAttribute('type') === 'file';
  }

  /**
   * Determine if a file input is for a resume or a photo
   * @returns {'resume' | 'photo' | null}
   */
  function classifyFileInput(field) {
    const attrs = getFieldAttributes(field);
    const accept = (field.getAttribute('accept') || '').toLowerCase();
    const allText = Object.values(attrs).join(' ') + ' ' + getLabelText(field).join(' ');

    if (/resume|cv|curriculum|document/i.test(allText) || /\.pdf/i.test(accept) || /application\/pdf/i.test(accept)) {
      return 'resume';
    }
    if (/photo|picture|avatar|headshot|profile[\s_-]?image|portrait/i.test(allText) || /image\//i.test(accept)) {
      return 'photo';
    }

    // Default: if PDF accepted → resume, if image accepted → photo
    if (accept.includes('pdf') || accept.includes('doc')) return 'resume';
    if (accept.includes('image') || accept.includes('jpg') || accept.includes('png')) return 'photo';

    return null;
  }

  return {
    FIELD_PATTERNS,
    matchField,
    isFileInput,
    classifyFileInput,
    getFieldAttributes,
    getLabelText
  };
})();

if (typeof window !== 'undefined') {
  window.AutoFillMatcher = AutoFillMatcher;
}
