import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { FinancialSummaryCard } from "@/components/dashboard/financial-summary-card";
import { Delta } from "@/components/shared/delta";
import { Money } from "@/components/shared/money";
import { MoneyInput } from "@/components/shared/money-input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { D } from "@/lib/money";

describe("BudgetProgress", () => {
  it("exposes usage and status to assistive tech, not just colour", () => {
    render(<BudgetProgress percent={D("112.4")} status="exceeded" label="Food budget used" />);
    const bar = screen.getByRole("progressbar", { name: "Food budget used" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "112% used — Budget exceeded");
    expect(screen.getByText(/Budget exceeded/)).toBeInTheDocument();
  });
});

describe("Delta", () => {
  it("shows direction with an icon and text, and treats rising expenses as bad", () => {
    const { container } = render(<Delta value={D("18.04")} upIsGood={false} label="vs last month" />);
    expect(screen.getByText("+18%")).toBeInTheDocument();
    expect(screen.getByText("vs last month")).toBeInTheDocument();
    expect(container.querySelector(".text-negative")).not.toBeNull();
  });

  it("handles missing comparison data", () => {
    render(<Delta value={null} />);
    expect(screen.getByText("No comparison data")).toBeInTheDocument();
  });
});

describe("Money", () => {
  it("formats IDR without decimals and signs expenses", () => {
    render(<Money value="1500000" currency="IDR" locale="id-ID" tone="expense" sign />);
    expect(screen.getByText(/-Rp\s?1\.500\.000/)).toBeInTheDocument();
  });
});

describe("FinancialSummaryCard", () => {
  it("renders the label, value and footer", () => {
    render(
      <TooltipProvider>
        <FinancialSummaryCard label="Net worth" value="Rp 10.000.000" hint="Assets minus liabilities" footer={<span>Assets Rp 12 jt</span>} />
      </TooltipProvider>,
    );
    expect(screen.getByText("Net worth")).toBeInTheDocument();
    expect(screen.getByText("Rp 10.000.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About Net worth" })).toBeInTheDocument();
  });
});

describe("MoneyInput", () => {
  function Harness({ locale, currency }: { locale: string; currency: string }) {
    const [value, setValue] = useState("");
    return (
      <>
        <MoneyInput aria-describedby={undefined} value={value} onChange={setValue} currency={currency} locale={locale} />
        <output data-testid="value">{value}</output>
      </>
    );
  }

  it("groups digits for display but emits a canonical decimal string", async () => {
    render(<Harness locale="id-ID" currency="IDR" />);
    await userEvent.type(screen.getByRole("textbox"), "1500000");
    expect(screen.getByRole("textbox")).toHaveValue("1.500.000");
    expect(screen.getByTestId("value")).toHaveTextContent("1500000");
  });

  it("supports decimals for currencies that have them", async () => {
    render(<Harness locale="en-US" currency="USD" />);
    await userEvent.type(screen.getByRole("textbox"), "1234.56");
    expect(screen.getByRole("textbox")).toHaveValue("1,234.56");
    expect(screen.getByTestId("value")).toHaveTextContent("1234.56");
  });
});
