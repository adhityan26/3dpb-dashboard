"use client"
import type { WizardState } from "./ShopeeCreateWizard"
interface Props { state: WizardState; update: (patch: Partial<WizardState>) => void; katalogImageUrl: string | null }
export function StepMedia({ }: Props) { return <div /> }
