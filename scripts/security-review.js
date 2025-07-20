// Security review and validation script for Tab Sync Extension
// Performs comprehensive security checks and validates implementation

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

/**
 * Security review configuration
 */
const SECURITY_CONFIG = {
  // Dangerous patterns to check for
  dangerousPatterns: [
    /eval\s*\(/g,
    /Function\s*\(/g,
    /innerHTML\s*=/g,
    /outerHTML\s*=/g,
    /document\.write/g,
    /\.execScript/g,
    /setTimeout\s*\(\s*["']/g,
    /setInterval\s*\(\s*["']/g
  ],
  
  // Required security headers/practices
  requiredSecurity: [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options'
  ],
  
  // Sensitive data patterns
  sensitivePatterns: [
    /password/gi,
    /secret/gi,
    /private.*key/gi,
    /api.*key/gi,
    /token/gi
  ],
  
  // File extensions to scan
  scanExtensions: ['.js', '.html', '.json', '.md'],
  
  // Directories to exclude
  excludeDirs: ['node_modules', '.git', 'dist', 'build']
};

/**
 * Security review results
 */
class SecurityReview {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      issues: [],
      summary: {}
    };
  }

  /**
   * Add security issue
   * @param {string} type - Issue type
   * @param {string} severity - Issue severity
   * @param {string} file - File path
   * @param {number} line - Line number
   * @param {string} description - Issue description
   * @param {string} recommendation - Fix recommendation
   */
  addIssue(type, severity, file, line, description, recommendation) {
    const issue = {
      type,
      severity,
      file,
      line,
      description,
      recommendation,
      timestamp: new Date().toISOString()
    };

    this.results.issues.push(issue);

    if (severity === 'critical' || severity === 'high') {
      this.results.failed++;
    } else if (severity === 'medium') {
      this.results.warnings++;
    } else {
      this.results.passed++;
    }
  }

  /**
   * Generate security report
   * @returns {Object} Security report
   */
  generateReport() {
    const totalIssues = this.results.issues.length;
    const criticalIssues = this.results.issues.filter(i => i.severity === 'critical').length;
    const highIssues = this.results.issues.filter(i => i.severity === 'high').length;
    const mediumIssues = this.results.issues.filter(i => i.severity === 'medium').length;
    const lowIssues = this.results.issues.filter(i => i.severity === 'low').length;

    this.results.summary = {
      totalIssues,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      overallRisk: this.calculateOverallRisk(),
      recommendations: this.generateRecommendations()
    };

    return this.results;
  }

  /**
   * Calculate overall risk level
   * @returns {string} Risk level
   */
  calculateOverallRisk() {
    const critical = this.results.issues.filter(i => i.severity === 'critical').length;
    const high = this.results.issues.filter(i => i.severity === 'high').length;
    const medium = this.results.issues.filter(i => i.severity === 'medium').length;

    if (critical > 0) return 'CRITICAL';
    if (high > 2) return 'HIGH';
    if (high > 0 || medium > 5) return 'MEDIUM';
    if (medium > 0) return 'LOW';
    return 'MINIMAL';
  }

  /**
   * Generate security recommendations
   * @returns {Array} Recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const issueTypes = [...new Set(this.results.issues.map(i => i.type))];

    issueTypes.forEach(type => {
      const typeIssues = this.results.issues.filter(i => i.type === type);
      const highestSeverity = typeIssues.reduce((max, issue) => {
        const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        return severityOrder[issue.severity] > severityOrder[max] ? issue.severity : max;
      }, 'low');

      recommendations.push({
        type,
        severity: highestSeverity,
        count: typeIssues.length,
        recommendation: this.getTypeRecommendation(type)
      });
    });

    return recommendations.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Get recommendation for issue type
   * @param {string} type - Issue type
   * @returns {string} Recommendation
   */
  getTypeRecommendation(type) {
    const recommendations = {
      'dangerous-code': 'Remove or replace dangerous code patterns with safer alternatives',
      'sensitive-data': 'Remove hardcoded sensitive data and use secure storage',
      'xss-vulnerability': 'Sanitize all user input and use safe DOM manipulation',
      'csp-violation': 'Update Content Security Policy to be more restrictive',
      'insecure-communication': 'Use HTTPS for all external communications',
      'weak-authentication': 'Implement stronger authentication mechanisms',
      'data-exposure': 'Ensure sensitive data is properly encrypted and protected',
      'permission-abuse': 'Request only necessary permissions and follow principle of least privilege'
    };

    return recommendations[type] || 'Review and address this security concern';
  }
}

/**
 * Main security reviewer class
 */
class SecurityReviewer {
  constructor() {
    this.review = new SecurityReview();
  }

  /**
   * Run comprehensive security review
   * @param {string} projectPath - Path to project root
   * @returns {Promise<Object>} Security review results
   */
  async runSecurityReview(projectPath = '.') {
    console.log('🔒 Starting comprehensive security review...\n');

    // 1. Scan source code for security issues
    await this.scanSourceCode(projectPath);

    // 2. Review manifest.json for security
    await this.reviewManifest(projectPath);

    // 3. Check authentication implementation
    await this.reviewAuthentication(projectPath);

    // 4. Review data handling practices
    await this.reviewDataHandling(projectPath);

    // 5. Check network security
    await this.reviewNetworkSecurity(projectPath);

    // 6. Review permissions and CSP
    await this.reviewPermissions(projectPath);

    // Generate final report
    const report = this.review.generateReport();
    this.printSecurityReport(report);

    return report;
  }

  /**
   * Scan source code for security vulnerabilities
   * @param {string} projectPath - Project path
   */
  async scanSourceCode(projectPath) {
    console.log('📁 Scanning source code for security vulnerabilities...');

    const files = this.getAllFiles(projectPath);
    
    for (const file of files) {
      if (!SECURITY_CONFIG.scanExtensions.includes(extname(file))) {
        continue;
      }

      try {
        const content = readFileSync(file, 'utf8');
        const lines = content.split('\n');

        // Check for dangerous patterns
        this.checkDangerousPatterns(file, lines);

        // Check for sensitive data exposure
        this.checkSensitiveData(file, lines);

        // Check for XSS vulnerabilities
        this.checkXSSVulnerabilities(file, lines);

        // Check for insecure practices
        this.checkInsecurePractices(file, lines);

      } catch (error) {
        this.review.addIssue(
          'file-access',
          'medium',
          file,
          0,
          `Could not read file: ${error.message}`,
          'Ensure file is accessible and properly formatted'
        );
      }
    }
  }

  /**
   * Review manifest.json for security issues
   * @param {string} projectPath - Project path
   */
  async reviewManifest(projectPath) {
    console.log('📋 Reviewing manifest.json for security...');

    const manifestPath = join(projectPath, 'manifest.json');
    
    try {
      const manifestContent = readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check permissions
      this.checkManifestPermissions(manifest);

      // Check CSP
      this.checkContentSecurityPolicy(manifest);

      // Check external connections
      this.checkExternalConnections(manifest);

      // Check web accessible resources
      this.checkWebAccessibleResources(manifest);

    } catch (error) {
      this.review.addIssue(
        'manifest-error',
        'high',
        manifestPath,
        0,
        `Manifest.json issue: ${error.message}`,
        'Fix manifest.json syntax and structure'
      );
    }
  }

  /**
   * Review authentication implementation
   * @param {string} projectPath - Project path
   */
  async reviewAuthentication(projectPath) {
    console.log('🔐 Reviewing authentication implementation...');

    const authFiles = [
      'shared/auth/auth-service.js',
      'shared/auth/google-auth.js',
      'shared/auth/github-auth.js'
    ];

    for (const authFile of authFiles) {
      const filePath = join(projectPath, authFile);
      
      try {
        const content = readFileSync(filePath, 'utf8');
        
        // Check for secure token storage
        this.checkTokenSecurity(filePath, content);

        // Check for proper OAuth implementation
        this.checkOAuthSecurity(filePath, content);

        // Check for authentication bypass
        this.checkAuthenticationBypass(filePath, content);

      } catch (error) {
        // File might not exist, which is okay
        continue;
      }
    }
  }

  /**
   * Review data handling practices
   * @param {string} projectPath - Project path
   */
  async reviewDataHandling(projectPath) {
    console.log('💾 Reviewing data handling practices...');

    const dataFiles = [
      'shared/storage/storage-service.js',
      'shared/tab-serializer.js',
      'shared/validation.js'
    ];

    for (const dataFile of dataFiles) {
      const filePath = join(projectPath, dataFile);
      
      try {
        const content = readFileSync(filePath, 'utf8');
        
        // Check for data encryption
        this.checkDataEncryption(filePath, content);

        // Check for input validation
        this.checkInputValidation(filePath, content);

        // Check for data sanitization
        this.checkDataSanitization(filePath, content);

      } catch (error) {
        continue;
      }
    }
  }

  /**
   * Review network security
   * @param {string} projectPath - Project path
   */
  async reviewNetworkSecurity(projectPath) {
    console.log('🌐 Reviewing network security...');

    const files = this.getAllFiles(projectPath);
    
    for (const file of files) {
      if (!file.endsWith('.js')) continue;

      try {
        const content = readFileSync(file, 'utf8');
        
        // Check for HTTPS usage
        this.checkHTTPSUsage(file, content);

        // Check for secure headers
        this.checkSecureHeaders(file, content);

        // Check for certificate validation
        this.checkCertificateValidation(file, content);

      } catch (error) {
        continue;
      }
    }
  }

  /**
   * Review permissions and CSP
   * @param {string} projectPath - Project path
   */
  async reviewPermissions(projectPath) {
    console.log('🛡️ Reviewing permissions and Content Security Policy...');

    const manifestPath = join(projectPath, 'manifest.json');
    
    try {
      const manifestContent = readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check for excessive permissions
      this.checkExcessivePermissions(manifest);

      // Check CSP strictness
      this.checkCSPStrictness(manifest);

      // Check host permissions
      this.checkHostPermissions(manifest);

    } catch (error) {
      this.review.addIssue(
        'permission-review',
        'medium',
        manifestPath,
        0,
        'Could not review permissions',
        'Ensure manifest.json is valid and accessible'
      );
    }
  }

  /**
   * Check for dangerous code patterns
   * @param {string} file - File path
   * @param {Array} lines - File lines
   */
  checkDangerousPatterns(file, lines) {
    lines.forEach((line, index) => {
      SECURITY_CONFIG.dangerousPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          this.review.addIssue(
            'dangerous-code',
            'high',
            file,
            index + 1,
            `Dangerous code pattern detected: ${line.trim()}`,
            'Replace with safer alternative or add proper validation'
          );
        }
      });
    });
  }

  /**
   * Check for sensitive data exposure
   * @param {string} file - File path
   * @param {Array} lines - File lines
   */
  checkSensitiveData(file, lines) {
    lines.forEach((line, index) => {
      // Skip comments and test files
      if (line.trim().startsWith('//') || file.includes('test')) {
        return;
      }

      SECURITY_CONFIG.sensitivePatterns.forEach(pattern => {
        if (pattern.test(line) && !line.includes('TODO') && !line.includes('FIXME')) {
          this.review.addIssue(
            'sensitive-data',
            'medium',
            file,
            index + 1,
            `Potential sensitive data exposure: ${line.trim()}`,
            'Remove hardcoded sensitive data and use secure storage'
          );
        }
      });
    });
  }

  /**
   * Check for XSS vulnerabilities
   * @param {string} file - File path
   * @param {Array} lines - File lines
   */
  checkXSSVulnerabilities(file, lines) {
    const xssPatterns = [
      /innerHTML\s*=\s*[^;]+\+/g,
      /outerHTML\s*=\s*[^;]+\+/g,
      /insertAdjacentHTML\s*\(/g,
      /document\.write\s*\(/g
    ];

    lines.forEach((line, index) => {
      xssPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          this.review.addIssue(
            'xss-vulnerability',
            'high',
            file,
            index + 1,
            `Potential XSS vulnerability: ${line.trim()}`,
            'Use safe DOM manipulation methods and sanitize input'
          );
        }
      });
    });
  }

  /**
   * Check for insecure practices
   * @param {string} file - File path
   * @param {Array} lines - File lines
   */
  checkInsecurePractices(file, lines) {
    const insecurePatterns = [
      { pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/g, message: 'HTTP usage detected' },
      { pattern: /Math\.random\(\)/g, message: 'Weak random number generation' },
      { pattern: /localStorage\.setItem.*password/gi, message: 'Password stored in localStorage' },
      { pattern: /sessionStorage\.setItem.*token/gi, message: 'Token stored in sessionStorage' }
    ];

    lines.forEach((line, index) => {
      insecurePatterns.forEach(({ pattern, message }) => {
        if (pattern.test(line)) {
          this.review.addIssue(
            'insecure-practice',
            'medium',
            file,
            index + 1,
            `${message}: ${line.trim()}`,
            'Use secure alternatives for sensitive operations'
          );
        }
      });
    });
  }

  /**
   * Check manifest permissions
   * @param {Object} manifest - Manifest object
   */
  checkManifestPermissions(manifest) {
    const permissions = manifest.permissions || [];
    const dangerousPermissions = [
      'tabs',
      'activeTab',
      'storage',
      'identity',
      'background'
    ];

    const excessivePermissions = [
      '<all_urls>',
      'http://*/*',
      'https://*/*',
      'file:///*'
    ];

    permissions.forEach(permission => {
      if (excessivePermissions.includes(permission)) {
        this.review.addIssue(
          'excessive-permissions',
          'high',
          'manifest.json',
          0,
          `Excessive permission requested: ${permission}`,
          'Request only specific origins needed for functionality'
        );
      }
    });
  }

  /**
   * Check Content Security Policy
   * @param {Object} manifest - Manifest object
   */
  checkContentSecurityPolicy(manifest) {
    const csp = manifest.content_security_policy;
    
    if (!csp) {
      this.review.addIssue(
        'missing-csp',
        'medium',
        'manifest.json',
        0,
        'No Content Security Policy defined',
        'Add restrictive CSP to prevent XSS attacks'
      );
      return;
    }

    // Check for unsafe CSP directives
    const unsafePatterns = [
      "'unsafe-eval'",
      "'unsafe-inline'",
      "data:",
      "*"
    ];

    unsafePatterns.forEach(pattern => {
      if (csp.includes(pattern)) {
        this.review.addIssue(
          'weak-csp',
          'medium',
          'manifest.json',
          0,
          `Unsafe CSP directive: ${pattern}`,
          'Remove unsafe CSP directives and use nonces or hashes'
        );
      }
    });
  }

  /**
   * Check token security implementation
   * @param {string} file - File path
   * @param {string} content - File content
   */
  checkTokenSecurity(file, content) {
    // Check for secure token storage
    if (content.includes('localStorage') && content.includes('token')) {
      this.review.addIssue(
        'insecure-token-storage',
        'high',
        file,
        0,
        'Tokens stored in localStorage',
        'Use chrome.storage.local for secure token storage'
      );
    }

    // Check for token transmission
    if (content.includes('http://') && content.includes('token')) {
      this.review.addIssue(
        'insecure-token-transmission',
        'critical',
        file,
        0,
        'Tokens transmitted over HTTP',
        'Use HTTPS for all token-related communications'
      );
    }
  }

  /**
   * Check OAuth security implementation
   * @param {string} file - File path
   * @param {string} content - File content
   */
  checkOAuthSecurity(file, content) {
    // Check for PKCE implementation
    if (content.includes('oauth') && !content.includes('code_challenge')) {
      this.review.addIssue(
        'missing-pkce',
        'medium',
        file,
        0,
        'OAuth implementation may be missing PKCE',
        'Implement PKCE for enhanced OAuth security'
      );
    }

    // Check for state parameter
    if (content.includes('oauth') && !content.includes('state')) {
      this.review.addIssue(
        'missing-state',
        'medium',
        file,
        0,
        'OAuth implementation may be missing state parameter',
        'Use state parameter to prevent CSRF attacks'
      );
    }
  }

  /**
   * Get all files in directory recursively
   * @param {string} dir - Directory path
   * @returns {Array} Array of file paths
   */
  getAllFiles(dir) {
    const files = [];
    
    const scan = (currentDir) => {
      const items = readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = join(currentDir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (!SECURITY_CONFIG.excludeDirs.includes(item)) {
            scan(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    };
    
    scan(dir);
    return files;
  }

  /**
   * Print security report
   * @param {Object} report - Security report
   */
  printSecurityReport(report) {
    console.log('\n' + '='.repeat(60));
    console.log('🔒 SECURITY REVIEW REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total Issues: ${report.summary.totalIssues}`);
    console.log(`   Critical: ${report.summary.criticalIssues}`);
    console.log(`   High: ${report.summary.highIssues}`);
    console.log(`   Medium: ${report.summary.mediumIssues}`);
    console.log(`   Low: ${report.summary.lowIssues}`);
    console.log(`   Overall Risk: ${report.summary.overallRisk}`);

    if (report.issues.length > 0) {
      console.log(`\n🚨 SECURITY ISSUES:`);
      
      report.issues
        .sort((a, b) => {
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        })
        .forEach((issue, index) => {
          const severityIcon = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🟢'
          };
          
          console.log(`\n   ${index + 1}. ${severityIcon[issue.severity]} ${issue.severity.toUpperCase()}`);
          console.log(`      File: ${issue.file}:${issue.line}`);
          console.log(`      Issue: ${issue.description}`);
          console.log(`      Fix: ${issue.recommendation}`);
        });
    }

    if (report.summary.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      
      report.summary.recommendations.forEach((rec, index) => {
        console.log(`\n   ${index + 1}. ${rec.type} (${rec.count} issues)`);
        console.log(`      ${rec.recommendation}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    
    if (report.summary.overallRisk === 'CRITICAL' || report.summary.overallRisk === 'HIGH') {
      console.log('❌ SECURITY REVIEW FAILED - Address critical/high issues before release');
    } else if (report.summary.overallRisk === 'MEDIUM') {
      console.log('⚠️  SECURITY REVIEW WARNING - Consider addressing medium issues');
    } else {
      console.log('✅ SECURITY REVIEW PASSED - No critical security issues found');
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// Run security review if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const reviewer = new SecurityReviewer();
  reviewer.runSecurityReview(process.argv[2] || '.')
    .then(report => {
      process.exit(report.summary.overallRisk === 'CRITICAL' ? 1 : 0);
    })
    .catch(error => {
      console.error('Security review failed:', error);
      process.exit(1);
    });
}

export { SecurityReviewer };