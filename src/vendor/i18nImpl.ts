// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export function serializeUIString(string: string, values: Record<string, Object> = {}): string {
  const serializedMessage = { string, values }
  return JSON.stringify(serializedMessage)
}
