# Standard Project Structure

```
project/
├── src/
│   └── {package}/
│       ├── api/
│       │   ├── dependencies.py      # Shared DI functions
│       │   └── v1/
│       │       ├── __init__.py      # Router aggregation
│       │       └── {domain}/
│       │           ├── router.py
│       │           └── schemas.py
│       ├── services/
│       │   └── {domain}_service.py
│       ├── repositories/
│       │   └── {entity}_repository.py
│       ├── clients/
│       │   └── {external}_client.py
│       ├── models/
│       │   └── {entity}.py          # SQLModel models
│       └── core/
│           ├── config.py            # Pydantic Settings
│           ├── database.py          # Async engine + session factory
│           ├── exceptions.py        # ServiceError hierarchy
│           └── logging.py           # Structured logging setup
├── tests/
│   ├── conftest.py
│   ├── unit/
│   └── integration/
├── pyproject.toml
└── .python-version
```

## Layer Responsibilities

| Layer | Purpose | Depends On |
|-------|---------|------------|
| `api/` | HTTP handling, request validation, response serialization | services |
| `services/` | Business logic, orchestration | repositories, clients |
| `repositories/` | Database access, queries | models, database session |
| `clients/` | External HTTP service integrations | httpx |
| `models/` | SQLModel table definitions | — |
| `core/` | Shared infrastructure (config, DB, exceptions) | — |

## Rules

- **Must** use `src/` layout with package name matching project
- **Must** keep routers thin—delegate logic to services
- **Must** never import from `api/` in `services/` or `repositories/`
- **Should** group by domain, not by technical layer, when the project grows
