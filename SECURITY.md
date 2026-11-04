# Data classification

Under ASVS V14.1, company qualification evidence is **company-confidential**.
This includes the registered capital, contract value and type of past work,
company certificates, personnel roster, and requirement-level match evidence.

The roster stores role, years of experience, degree and personal certificate
names. It has no employee names, identifiers, contact details or document
uploads. One entry represents one person for headcount checks. Members of the
company can view and edit its qualification evidence. The API resolves
membership from the signed-in account on each request, including when computing
a match. Company qualifications and match responses are private and use
`Cache-Control: private, no-store`.

Gemini receives the procurement PDF during ingestion. Company-confidential
records stay in the application and are compared by the matching service.

Company membership follows the existing self-service join policy. A registered
officer can join a company through the company directory. Access to company
evidence follows that membership.
