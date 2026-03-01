/**
 * HAQ Botanicals - Main JavaScript
 * Minimal, secure, vanilla JavaScript
 * No external dependencies
 */

(function() {
    'use strict';

    // ==========================================================================
    // DOM Elements
    // ==========================================================================

    const header = document.querySelector('.header');
    const navToggle = document.querySelector('.nav__toggle');
    const navMenu = document.querySelector('.nav__menu');
    const navLinks = document.querySelectorAll('.nav__link');

    // ==========================================================================
    // Header Scroll Effect
    // ==========================================================================

    function handleScroll() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    // ==========================================================================
    // Mobile Navigation Toggle
    // ==========================================================================

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');

            // Update aria-expanded for accessibility
            const isExpanded = navMenu.classList.contains('active');
            navToggle.setAttribute('aria-expanded', isExpanded);
        });

        // Close menu when clicking a link
        navLinks.forEach(function(link) {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!navToggle.contains(event.target) && !navMenu.contains(event.target)) {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ==========================================================================
    // Smooth Scroll for Anchor Links
    // ==========================================================================

    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');

            // Skip if it's just "#"
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                e.preventDefault();

                const headerHeight = header ? header.offsetHeight : 0;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ==========================================================================
    // Scroll Animation (Intersection Observer)
    // ==========================================================================

    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    if (animatedElements.length > 0 && 'IntersectionObserver' in window) {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        animatedElements.forEach(function(element) {
            observer.observe(element);
        });
    } else {
        // Fallback: show all elements immediately
        animatedElements.forEach(function(element) {
            element.classList.add('visible');
        });
    }

    // ==========================================================================
    // Active Navigation Link Highlight
    // ==========================================================================

    const sections = document.querySelectorAll('section[id]');

    function highlightNavigation() {
        const scrollPosition = window.scrollY + 100;

        sections.forEach(function(section) {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(function(link) {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + sectionId) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    if (sections.length > 0) {
        window.addEventListener('scroll', highlightNavigation, { passive: true });
    }

    // ==========================================================================
    // Email Protection (Basic obfuscation display)
    // ==========================================================================

    // This helps prevent simple email scrapers while keeping functionality
    document.querySelectorAll('[data-email]').forEach(function(element) {
        const email = element.getAttribute('data-email');
        if (email) {
            element.textContent = email;
            element.setAttribute('href', 'mailto:' + email);
        }
    });

    // ==========================================================================
    // Form Handling - Validation & Submission
    // ==========================================================================

    /**
     * Validates a single form field and shows/hides error state
     */
    function validateField(field) {
        var group = field.closest('.form__group') || field.closest('.form__fieldset');
        var isValid = true;
        var errorMessage = '';
        var isGerman = document.documentElement.lang === 'de';

        // Remove previous state
        field.classList.remove('is-invalid', 'is-valid');
        if (group) group.classList.remove('has-error');

        // Required check
        if (field.hasAttribute('required') && !field.value.trim() && field.type !== 'checkbox' && field.type !== 'file') {
            isValid = false;
            errorMessage = isGerman ? 'Dieses Feld ist erforderlich.' : 'This field is required.';
        }

        // Email validation
        if (field.type === 'email' && field.value.trim()) {
            var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(field.value.trim())) {
                isValid = false;
                errorMessage = isGerman ? 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' : 'Please enter a valid email address.';
            }
        }

        // URL validation (optional field)
        if (field.type === 'url' && field.value.trim()) {
            try {
                new URL(field.value.trim());
            } catch (e) {
                isValid = false;
                errorMessage = 'Please enter a valid URL (e.g., https://example.com).';
            }
        }

        // File validation
        if (field.type === 'file') {
            if (field.hasAttribute('required') && field.files.length === 0) {
                isValid = false;
                errorMessage = isGerman ? 'Bitte laden Sie das erforderliche Dokument hoch.' : 'Please upload the required document.';
            }
            if (field.files.length > 0) {
                var file = field.files[0];
                if (!file.type.includes('pdf')) {
                    isValid = false;
                    errorMessage = 'Only PDF files are accepted.';
                }
                if (file.size > 10 * 1024 * 1024) {
                    isValid = false;
                    errorMessage = 'File size must be under 10 MB.';
                }
            }
        }

        // Checkbox validation
        if (field.type === 'checkbox' && field.hasAttribute('required') && !field.checked) {
            isValid = false;
            field.classList.add('is-invalid');
        }

        // Apply visual state
        if (!isValid) {
            field.classList.add('is-invalid');
            if (group) {
                group.classList.add('has-error');
                var errorEl = group.querySelector('.form__error');
                if (!errorEl && errorMessage) {
                    errorEl = document.createElement('span');
                    errorEl.className = 'form__error';
                    errorEl.setAttribute('role', 'alert');
                    if (field.type === 'file') {
                        group.appendChild(errorEl);
                    } else {
                        field.insertAdjacentElement('afterend', errorEl);
                    }
                }
                if (errorEl) errorEl.textContent = errorMessage;
            }
        } else if (field.value && field.type !== 'checkbox' && field.type !== 'file') {
            field.classList.add('is-valid');
        }

        return isValid;
    }

    /**
     * Validates compliance checkboxes (all must be checked)
     */
    function validateComplianceCheckboxes(form) {
        var complianceBoxes = form.querySelectorAll('[data-compliance]');
        if (complianceBoxes.length === 0) return true;

        var allChecked = true;
        complianceBoxes.forEach(function(cb) {
            if (!cb.checked) {
                allChecked = false;
                cb.classList.add('is-invalid');
            } else {
                cb.classList.remove('is-invalid');
            }
        });
        return allChecked;
    }

    /**
     * Validates entire form
     */
    function validateForm(form) {
        var fields = form.querySelectorAll('.form__input, .form__textarea, .form__checkbox[required], .form__file-input[required]');
        var isFormValid = true;
        var firstInvalid = null;

        fields.forEach(function(field) {
            var fieldValid = validateField(field);
            if (!fieldValid && !firstInvalid) {
                firstInvalid = field;
            }
            if (!fieldValid) isFormValid = false;
        });

        if (!validateComplianceCheckboxes(form)) {
            isFormValid = false;
            if (!firstInvalid) {
                firstInvalid = form.querySelector('[data-compliance]');
            }
        }

        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (firstInvalid.focus) firstInvalid.focus();
        }

        return isFormValid;
    }

    /**
     * Handles form submission via AJAX
     */
    function handleFormSubmit(form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            if (!validateForm(form)) return;

            var submitBtn = form.querySelector('.btn--form');
            var statusEl = form.querySelector('.form__status');
            var isGerman = document.documentElement.lang === 'de';

            // Loading state
            submitBtn.classList.add('is-loading');
            submitBtn.disabled = true;
            statusEl.className = 'form__status';
            statusEl.textContent = '';

            var formData = new FormData(form);

            fetch('/api/contact', {
                method: 'POST',
                body: formData
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                submitBtn.classList.remove('is-loading');
                submitBtn.disabled = false;

                if (data.success) {
                    statusEl.className = 'form__status form__status--success';
                    statusEl.textContent = isGerman
                        ? 'Vielen Dank! Ihre Anfrage wurde erfolgreich gesendet. Wir melden uns innerhalb von 48 Stunden.'
                        : 'Thank you! Your application has been submitted successfully. We will respond within 48 hours.';
                    form.reset();
                    // Reset file displays
                    form.querySelectorAll('.form__file-display').forEach(function(el) {
                        el.classList.remove('has-file');
                        el.querySelector('.form__file-text').textContent = 'Choose PDF file...';
                    });
                    // Remove validation classes
                    form.querySelectorAll('.is-valid, .is-invalid').forEach(function(el) {
                        el.classList.remove('is-valid', 'is-invalid');
                    });
                } else {
                    throw new Error(data.message || 'Submission failed');
                }
            })
            .catch(function(error) {
                submitBtn.classList.remove('is-loading');
                submitBtn.disabled = false;
                statusEl.className = 'form__status form__status--error';
                statusEl.textContent = isGerman
                    ? 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut oder kontaktieren Sie uns per E-Mail.'
                    : 'An error occurred. Please try again or contact us via email.';
                console.error('Form submission error:', error);
            });
        });
    }

    /**
     * Updates file upload display when a file is selected
     */
    function initFileUploads() {
        document.querySelectorAll('.form__file-input').forEach(function(input) {
            input.addEventListener('change', function() {
                var display = this.parentElement.querySelector('.form__file-display');
                var textEl = display.querySelector('.form__file-text');

                if (this.files.length > 0) {
                    var file = this.files[0];
                    textEl.textContent = file.name + ' (' + (file.size / (1024 * 1024)).toFixed(1) + ' MB)';
                    display.classList.add('has-file');
                    this.classList.remove('is-invalid');
                } else {
                    textEl.textContent = 'Choose PDF file...';
                    display.classList.remove('has-file');
                }
            });
        });
    }

    /**
     * Adds blur validation for immediate feedback
     */
    function initBlurValidation() {
        document.querySelectorAll('.haq-form .form__input, .haq-form .form__textarea').forEach(function(field) {
            field.addEventListener('blur', function() {
                if (this.value.trim()) {
                    validateField(this);
                }
            });

            field.addEventListener('input', function() {
                if (this.classList.contains('is-invalid')) {
                    this.classList.remove('is-invalid');
                    var group = this.closest('.form__group');
                    if (group) group.classList.remove('has-error');
                }
            });
        });
    }

    // ==========================================================================
    // Initialize
    // ==========================================================================

    // Run scroll handler on page load
    handleScroll();

    // --- Form Initialization ---
    var customerForm = document.getElementById('customer-form');
    var supplierForm = document.getElementById('supplier-form');

    if (customerForm) {
        handleFormSubmit(customerForm);
    }
    if (supplierForm) {
        handleFormSubmit(supplierForm);
    }

    initFileUploads();
    initBlurValidation();

    // Log initialization
    console.log('HAQ Botanicals website initialized');

})();
