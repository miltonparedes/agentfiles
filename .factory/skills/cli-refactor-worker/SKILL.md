---
name: cli-refactor-worker
description: Implementa y valida mejoras del CLI (parser tipado, prompts, scope/agentes y reglas de instalación) con pruebas automatizadas y verificación manual en terminal.
---

# CLI Refactor Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Usa este skill para features del CLI que toquen:
- Parseo/dispatch (`yargs` tipado)
- Flujos interactivos (`@clack/prompts`)
- Enrutamiento por scope (`project`/`user`) y selección por agente
- Integración con `rulesync`, política warning+omit, y pruebas (unit/integration/smoke)

## Work Procedure

1. Leer `mission.md`, `AGENTS.md`, `validation-contract.md` y la feature asignada.
2. Definir contrato de cambios y escribir tests primero (red):
   - Unit para parser/intención.
   - Integration mock para dispatch/routing.
   - Integration real (dry-run) para paths/warnings/scope.
   - Si la feature es de hardening/validación sin cambio conductual directo, documentar por qué se adapta el orden y agregar cobertura determinística equivalente antes de cerrar.
3. Implementar cambios mínimos para pasar tests (green), preservando compatibilidad de comandos/flags.
4. Verificar manualmente en terminal los casos interactivos y non-TTY de la feature.
5. Para cualquier assertion con contrato explícito de argumentos CLI, ejecutar al menos un caso directo con esa forma exacta (ejemplo: `af setup [path]`).
6. Ejecutar validadores requeridos por la feature:
   - `bun run test:unit`
   - `bun run test:integration:mock`
   - `bun run test:integration:real`
   - `bun run lint`
   - `bun run format:check`
   - `bun run build`
   (si `test:integration:real` no está disponible aún, correr fallback `bun run test:integration:mock` y dejar constancia explícita en handoff)
   (si cualquier validador requerido se omite, reportar `followedProcedure: false` en skillFeedback con justificación concreta)
   (si la feature no afecta todos, justificar alcance de comandos corridos)
7. Confirmar que no quedan procesos colgados ni archivos temporales inesperados.
8. Completar handoff con comandos, evidencia y issues reales.
9. Si la feature toca flujo interactivo, incluir evidencia en `interactiveChecks` **o** una alternativa determinística explícita (tests + verificación de rutas/salidas) cuando interacción directa no sea viable; si no hay ninguna, reportar `followedProcedure: false` con motivo.

## Example Handoff

```json
{
  "salientSummary": "Migré el parser principal a yargs tipado y reemplacé la UI interactiva por @clack/prompts manteniendo compatibilidad de comandos históricos. Ajusté scope estricto para install -y y añadí manejo warning+omit en combinaciones no soportadas. Cerré con suites unit/integration y smoke CLI en non-TTY.",
  "whatWasImplemented": "Se creó módulo de parseo tipado con yargs y normalización de intención por comando, se actualizó el dispatch para conservar contratos legacy, y se reemplazó el flujo de prompts de Ink por @clack/prompts (single/multi-select, cancelación y preselecciones por flags). También se implementó selección explícita por agente en comandos aplicables, política warning+omit para pares no soportados, y limpieza determinística de staging temporal de rulesync.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "bun run test:unit",
        "exitCode": 0,
        "observation": "Parser/intención: casos de compatibilidad y flags equivalentes en verde."
      },
      {
        "command": "bun run test:integration:mock",
        "exitCode": 0,
        "observation": "Dispatch/routing por comando+scope+agente validado con stubs."
      },
      {
        "command": "bun run test:integration:real",
        "exitCode": 0,
        "observation": "Dry-run real valida rutas de destino y warning+omit."
      },
      {
        "command": "bun run lint && bun run format:check && bun run build",
        "exitCode": 0,
        "observation": "Validadores del repo en verde."
      }
    ],
    "interactiveChecks": [
      {
        "action": "Abrir `af install` en TTY, seleccionar subset mínimo y confirmar.",
        "observed": "Solo se planificaron categorías seleccionadas; no hubo keypress bleed."
      },
      {
        "action": "Cancelar `af skills` en dos etapas con Ctrl+C.",
        "observed": "Salida consistente sin stacktrace ni efectos secundarios en archivos."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "cli/tests/unit/parser.test.ts",
        "cases": [
          {
            "name": "equivalencia flags cortos/largos",
            "verifies": "-y/-n/-u/-v son equivalentes a sus variantes largas"
          }
        ]
      },
      {
        "file": "cli/tests/integration/real/scope-agent-dryrun.test.ts",
        "cases": [
          {
            "name": "install -y respeta --user de forma estricta",
            "verifies": "sin --user -> project; con --user -> user"
          }
        ]
      }
    ]
  },
  "discoveredIssues": [
    {
      "severity": "medium",
      "description": "La HOME real contiene estado preexistente de rulesync que puede sesgar integración real; se mitigó con HOME temporal en pruebas.",
      "suggestedFix": "Mantener fixture HOME aislado en comandos de integración real y documentarlo en library/user-testing.md."
    }
  ]
}
```

## When to Return to Orchestrator

- Cuando una regla de compatibilidad solicitada contradiga explícitamente el comportamiento requerido en `validation-contract.md`.
- Cuando una dependencia externa de `rulesync` impida validar rutas reales (fallo de red persistente o binario inaccesible).
- Cuando falte definición de aplicabilidad de `--agent` para un comando y el contrato no permita inferencia segura.
