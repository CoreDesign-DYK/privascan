# PrivaScan

Privacy-first mobile document scanner PWA. Scans, processes, and exports PDF/JPEG entirely on-device — no server, no cloud upload.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## Versioning

버전 파일: `artifacts/web-scanner/package.json` → `"version"` 필드 **한 곳만** 수정하면 앱 내 모든 표시(`v1.0.0`)에 자동 반영됩니다.  
(Vite `define.__APP_VERSION__` 으로 빌드 시 주입 → `__APP_VERSION__` 전역 상수)

### 버전 규칙 (Semantic Versioning: MAJOR.MINOR.PATCH)

| 자리 | 올리는 조건 | 예시 |
|---|---|---|
| **MAJOR** (첫째 자리) | 기존 사용자 데이터 구조 변경, 호환 불가능한 기능 제거, 앱 전면 재설계 | `1.0.0` → `2.0.0` |
| **MINOR** (둘째 자리) | 새 기능 추가 (하위 호환 유지): 신규 메뉴, 새 내보내기 형식, 클라우드 연동 등 | `1.0.0` → `1.1.0` |
| **PATCH** (셋째 자리) | 버그 수정, UI 미세 조정, 텍스트 변경, 성능 개선 | `1.0.0` → `1.0.1` |

### 버전 올리는 방법

```
artifacts/web-scanner/package.json
  "version": "1.0.1"  ← 이 한 줄만 수정
```

앱 재시작 없이 Vite HMR이 즉시 반영합니다.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
