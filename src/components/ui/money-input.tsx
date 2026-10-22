import * as React from "react"

import { Input, type InputProps } from "@/components/ui/input"
import {
  caretAfterDigits,
  digitsBefore,
  formatMoneyInput,
  parseMoneyInput,
} from "@/lib/format/money-input"

export interface MoneyInputProps
  extends Omit<InputProps, "type" | "value" | "onChange" | "inputMode"> {
  /** Valeur brute, comme un champ numérique (« 10000.5 » ou ""). */
  value: string
  onValueChange: (raw: string) => void
}

/**
 * Champ montant : affiche « 10 000,50 » pendant la frappe, renvoie « 10000.50 ».
 * Pas de molette (champ texte), virgule ou point acceptés.
 */
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const pendingCaret = React.useRef<number | null>(null)
    // Frappe sans effet sur la valeur (lettre, 3e décimale) : re-rendu local pour replacer le curseur.
    const [, forceRender] = React.useReducer((n: number) => n + 1, 0)
    const display = formatMoneyInput(value)

    React.useLayoutEffect(() => {
      const el = innerRef.current
      const caret = pendingCaret.current
      pendingCaret.current = null
      if (el && caret != null && document.activeElement === el) {
        el.setSelectionRange(caret, caret)
      }
    })

    return (
      <Input
        {...props}
        ref={(el) => {
          innerRef.current = el
          if (typeof forwardedRef === "function") forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
        }}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={(e) => {
          let text = e.target.value
          let caret = e.target.selectionStart ?? text.length
          const inputType = (e.nativeEvent as InputEvent).inputType
          // Effacer un espace des milliers efface le chiffre voisin (sinon l'espace revient).
          if (text.length === display.length - 1 && display[caret] === " ") {
            if (inputType === "deleteContentBackward" && caret > 0) {
              text = text.slice(0, caret - 1) + text.slice(caret)
              caret -= 1
            } else if (inputType === "deleteContentForward") {
              text = text.slice(0, caret) + text.slice(caret + 1)
            }
          }
          const raw = parseMoneyInput(text)
          pendingCaret.current = caretAfterDigits(formatMoneyInput(raw), digitsBefore(text, caret))
          if (raw === value) forceRender()
          else onValueChange(raw)
        }}
      />
    )
  }
)
MoneyInput.displayName = "MoneyInput"

export { MoneyInput }
