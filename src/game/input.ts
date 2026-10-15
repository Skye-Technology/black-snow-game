/** Raw input, sampled by the simulation once per frame. */
export const input = {
  held: new Set<string>(),
  /** Keys/buttons pressed since the last frame. Cleared by consumePressed(). */
  pressed: new Set<string>(),
  fireHeld: false,
  lookX: 0,
  lookY: 0,
}

export const isLocked = () => typeof document !== 'undefined' && document.pointerLockElement !== null

export function consumeLook(): [number, number] {
  const look: [number, number] = [input.lookX, input.lookY]
  input.lookX = 0
  input.lookY = 0
  return look
}

export function consumePressed(code: string): boolean {
  return input.pressed.delete(code)
}

export function clearInput(): void {
  input.held.clear()
  input.pressed.clear()
  input.fireHeld = false
  input.lookX = 0
  input.lookY = 0
}

/** Starts listening on window. Returns a function that stops listening. */
export function attachInput(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (!isLocked()) return
    if (e.code === 'Space') e.preventDefault()
    if (!e.repeat) input.pressed.add(e.code)
    input.held.add(e.code)
  }
  const onKeyUp = (e: KeyboardEvent) => input.held.delete(e.code)
  const onMouseDown = (e: MouseEvent) => {
    if (!isLocked()) return
    if (e.button === 0) input.fireHeld = true
    if (e.button === 2) input.pressed.add('Mouse2')
  }
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) input.fireHeld = false
  }
  const onMouseMove = (e: MouseEvent) => {
    if (!isLocked()) return
    input.lookX += e.movementX
    input.lookY += e.movementY
  }
  const onContextMenu = (e: Event) => e.preventDefault()
  const onBlur = () => clearInput()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('contextmenu', onContextMenu)
    window.removeEventListener('blur', onBlur)
  }
}
