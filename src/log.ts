export const log = (...args: any[]) => console.log(new Date().toISOString(), ...args)
export const error = (...args: any[]) => console.error(new Date().toISOString(), ...args)
