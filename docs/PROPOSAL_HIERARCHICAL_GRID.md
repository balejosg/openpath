# Propuesta de UX: Gestión Jerárquica de Dominios (Tree Grid)

## Estado: ✅ IMPLEMENTADO

## 1. Objetivo

Transformar la lista plana de reglas en una estructura jerárquica visual que agrupe dominios, subdominios y rutas bajo su "Dominio Raíz" (SLD+TLD). Esto facilita la gestión de políticas complejas (ej. bloquear todo `google.com` excepto `classroom.google.com`).

## 2. Estructura Visual (Tree Grid)

El componente `HierarchicalRulesTable` muestra reglas agrupadas por dominio raíz.

### Columnas Implementadas

| Jerarquía (Regla)            |    Estado    |       Acciones        |
| :--------------------------- | :----------: | :-------------------: |
| `▼ google.com` _(2 reglas)_  |   `Mixto`    |         `[+]`         |
| `    ↳ google.com`           | `Permitido`  | `[Editar] [Eliminar]` |
| `    ↳ ads.google.com`       | `Sub. bloq.` | `[Editar] [Eliminar]` |
| `▶ facebook.com` _(1 regla)_ | `Permitido`  |         `[+]`         |

### Estados del Grupo (Padre)

- ✅ **Permitido:** Todas las reglas hijas son `whitelist`.
- 🚫 **Bloqueado:** Todas las reglas hijas son `blocked_*`.
- ⚠️ **Mixto:** Mezcla de permitidos y bloqueados.

## 3. Funcionalidades Implementadas

### 3.1. Extracción de Dominio Raíz con ccTLDs

La función `getRootDomain()` soporta correctamente:

- Dominios estándar: `mail.google.com` → `google.com`
- ccTLDs: `news.bbc.co.uk` → `bbc.co.uk`
- Dominios argentinos: `www.mercadolibre.com.ar` → `mercadolibre.com.ar`

### 3.2. Toggle Vista Plana/Jerárquica

En `RulesManager.tsx` hay un toggle para cambiar entre:

- **Lista:** Vista plana tradicional (`RulesTable`)
- **Árbol:** Vista jerárquica agrupada (`HierarchicalRulesTable`)

### 3.3. Selección Múltiple

- Checkbox en header para seleccionar todo
- Checkbox por grupo para seleccionar todas las reglas del grupo
- Checkbox individual por regla

### 3.4. Edición Inline

- Click en valor para editar
- Enter para guardar, Escape para cancelar
- Botones de guardar/cancelar visibles

### 3.5. Expand/Collapse

- Click en fila de grupo para expandir/contraer
- Iconos de chevron indican estado

## 4. Archivos Creados/Modificados

### Nuevos

| Archivo                                                              | Propósito                                |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `react-spa/src/components/HierarchicalRulesTable.tsx`                | Componente principal de vista jerárquica |
| `react-spa/src/components/__tests__/HierarchicalRulesTable.test.tsx` | 46 tests unitarios                       |

### Modificados

| Archivo                                | Cambios                       |
| -------------------------------------- | ----------------------------- |
| `react-spa/src/views/RulesManager.tsx` | Toggle vista plana/jerárquica |

## 5. Pendiente (No Implementado)

### 5.1. Paginación por Dominios Raíz

Actualmente la paginación se hace por reglas individuales. Para evitar que un dominio se divida entre páginas, se necesita:

**Backend:**

```typescript
// Nuevo endpoint o modificación de listRulesPaginated
listRulesPaginatedByRoot: {
  input: { groupId, limit, offset, search },
  // 1. Obtener los N dominios raíz únicos
  // 2. Retornar TODAS las reglas de esos dominios
}
```

**Frontend:**

- Modificar `useRulesManager` para paginar por grupos

### 5.2. Botón "Añadir Subdominio"

El botón `[+]` en cada grupo está preparado pero requiere:

- Callback `onAddSubdomain` en el componente padre
- UI para pre-rellenar el dominio padre en el input

## 6. Tests

```bash
# Ejecutar tests del componente
cd react-spa
npm run test -- --run src/components/__tests__/HierarchicalRulesTable.test.tsx


# Resultado: 46 tests passing
```

## 7. Uso

```tsx
import { HierarchicalRulesTable } from '../components/HierarchicalRulesTable';

<HierarchicalRulesTable
  rules={rules}
  loading={loading}
  onDelete={handleDelete}
  onSave={handleSave}
  selectedIds={selectedIds}
  onToggleSelection={toggleSelection}
  onToggleSelectAll={toggleSelectAll}
  isAllSelected={isAllSelected}
  hasSelection={hasSelection}
/>;
```
