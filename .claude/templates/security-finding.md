# Template: Security Finding (security-engineer, wiki Security Audit page)

````markdown
### [SEVERITY] Finding Title

**OWASP Category**: A0X - Category Name (if applicable)
**Severity**: Critical | High | Medium | Low | Informational
**Status**: Open | In Progress | Resolved | Accepted Risk
**Date Found**: YYYY-MM-DD
**Date Resolved**: YYYY-MM-DD (if applicable)

**Description**:
Clear explanation of the vulnerability and its potential impact.

**Affected Files**:

- `path/to/file.ts:LINE_NUMBER` — description of the issue at this location

**Proof of Concept**:

```
Steps or code to reproduce the vulnerability
```

**Remediation**:
Specific guidance with code examples showing the secure implementation.

**Risk if Unaddressed**:
What could happen if this is not fixed.
````

Severity scale: **Critical** = immediate exploitation, full compromise / data breach / auth bypass — fix before deployment; **High** = exploitable with moderate effort — fix in the current cycle; **Medium** = needs specific conditions — fix soon; **Low** = limited exploit potential — fix when convenient; **Informational** = best-practice / defense-in-depth.
