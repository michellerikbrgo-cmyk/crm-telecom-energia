import { describe, expect, it } from "vitest";
import { contactRowInUserCompanyScope } from "./companyHierarchy";

describe("contactRowInUserCompanyScope", () => {
  it("Super Admin vê qualquer tenant/company", () => {
    expect(
      contactRowInUserCompanyScope(
        { isSuperAdmin: true, crmRole: "coordenador", tenantId: 1, companyId: null },
        { tenantId: 99, companyId: 5 },
      ),
    ).toBe(true);
  });

  it("Coordenador vê contactos de qualquer company no mesmo tenant", () => {
    expect(
      contactRowInUserCompanyScope(
        { crmRole: "coordenador", tenantId: 10, companyId: 1 },
        { tenantId: 10, companyId: 2 },
      ),
    ).toBe(true);
  });

  it("CE só vê contactos da mesma sub-empresa quando ambos têm companyId", () => {
    expect(
      contactRowInUserCompanyScope(
        { crmRole: "ce", tenantId: 10, companyId: 20 },
        { tenantId: 10, companyId: 20 },
      ),
    ).toBe(true);
    expect(
      contactRowInUserCompanyScope(
        { crmRole: "ce", tenantId: 10, companyId: 20 },
        { tenantId: 10, companyId: 21 },
      ),
    ).toBe(false);
  });

  it("rejeita tenant diferente", () => {
    expect(
      contactRowInUserCompanyScope(
        { crmRole: "vendedor", tenantId: 10, companyId: 20 },
        { tenantId: 11, companyId: 20 },
      ),
    ).toBe(false);
  });
});
