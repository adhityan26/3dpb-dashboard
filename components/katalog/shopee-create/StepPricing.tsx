"use client"
import type { WizardState } from "./ShopeeCreateWizard"
interface Props { state: WizardState; update: (patch: Partial<WizardState>) => void }
export function StepPricing({ }: Props) { return <div /> }
