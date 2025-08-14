## Gitorial Tutorial Commit Specification — v1

### 1. Scope
This specification defines the allowed commit types and the constraints on sequences of commits for Gitorial tutorials. It intentionally omits implementation details.

### 2. Terms and notation
- Let C be a finite sequence of commits: C = [c₀, c₁, …, cₙ₋₁], n ≥ 1.
- Each commit cᵢ has a type t(cᵢ) ∈ T and a multiset of changed file paths F(cᵢ).
- Let basename(p) denote the last path component of path p.

### 3. Commit types
T = { section, template, solution, action, readme }.

### 4. Constraints
The following MUST hold for every valid sequence C:

4.1 Section content constraint
- For every i with t(cᵢ) = section:
  - |F(cᵢ)| = 1, and
  - basename(the unique p ∈ F(cᵢ)) = "README.md".

4.2 Template–Solution adjacency
- For every i with t(cᵢ) = template:
  - i + 1 < n, and t(cᵢ₊₁) = solution.

4.3 Solution predecessor constraint
- For every i with t(cᵢ) = solution:
  - i > 0, and t(cᵢ₋₁) ∈ { template, action }.

4.4 Readme finality (mandatory)
- There exists exactly one index i such that t(cᵢ) = readme.
- i = n − 1 (equivalently, t(cₙ₋₁) = readme).
- For all j ≠ i, t(cⱼ) ≠ readme.

### 5. Non‑requirements (v1)
- No additional ordering constraints are imposed beyond §4.
- No constraints are imposed on titles or metadata beyond the file requirements in §4.1.

### 6. Versioning
This is version v1 of the specification. Future versions may introduce additional types or constraints while maintaining a clear version boundary.


