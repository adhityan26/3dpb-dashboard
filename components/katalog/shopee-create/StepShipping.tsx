"use client"
import type { WizardState } from "./ShopeeCreateWizard"
interface Props { state: WizardState; update: (patch: Partial<WizardState>) => void }
export function StepShipping({ }: Props) { return <div /> }
