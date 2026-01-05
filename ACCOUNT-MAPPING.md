# 📅 Account-to-Schedule Mapping Feature

## Overview

This feature allows you to assign **specific accounts** to **specific scheduled times**. Instead of running all accounts at every scheduled time (like XX:29 and XX:59), you can now map:

- **Account 1** → Runs ONLY at **XX:29**
- **Account 2** → Runs ONLY at **XX:59**

This is useful when you want to spread out account activity to avoid rate limiting or detection.

---

## ⚙️ Configuration

Edit `src/config/loop-config.ts`:

### Option 1: Normal Schedule Mode (All accounts run at same times)
```typescript
schedule: {
    enabled: true,
    minutes: [29, 59],  // All accounts run at both :29 and :59
    
    accountMapping: {
        enabled: false,  // Disabled - all accounts run together
    },
}
```

**Behavior:**
- ✅ At **11:29** → Account 1 and Account 2 both run
- ✅ At **11:59** → Account 1 and Account 2 both run
- ✅ At **12:29** → Account 1 and Account 2 both run
- ... and so on

---

### Option 2: Account Mapping Mode (Each account runs at its own time)
```typescript
schedule: {
    enabled: true,
    minutes: [29, 59],  // Not used when accountMapping is enabled
    
    accountMapping: {
        enabled: true,   // ✅ ENABLED - each account has its own schedule
        mapping: [29, 59],  // Account 1 at :29, Account 2 at :59
    },
},

accounts: [
    { email: 'account1@gmail.com', password: 'pass1' },  // Index 0 → :29
    { email: 'account2@gmail.com', password: 'pass2' },  // Index 1 → :59
],
```

**Behavior:**
- ✅ At **11:29** → **ONLY Account 1** runs
- ✅ At **11:59** → **ONLY Account 2** runs
- ✅ At **12:29** → **ONLY Account 1** runs
- ✅ At **12:59** → **ONLY Account 2** runs
- ... and so on

---

## 📊 Examples

### Example 1: 2 Accounts with Different Gmail
```typescript
accounts: [
    { email: 'carlo1@gmail.com', password: 'Anypassw0rd@' },
    { email: 'carlo2@gmail.com', password: 'Anypassw0rd@' },
],

schedule: {
    enabled: true,
    minutes: [29, 59],
    
    accountMapping: {
        enabled: true,
        mapping: [29, 59],  // carlo1 at :29, carlo2 at :59
    },
},

gmail: {
    enabled: true,
    user: 'carlo1@gmail.com',  // Used for Account 1 OTP
    appPassword: 'mctm somb ortc pulv',
},
```

> ⚠️ **Note:** If accounts use different Gmail addresses, you'll need to update the `gmail.user` to match the account being processed. Currently, the system uses one Gmail config for all accounts.

---

### Example 2: 3 Accounts at Different Times
```typescript
accounts: [
    { email: 'account1@gmail.com', password: 'pass1' },
    { email: 'account2@gmail.com', password: 'pass2' },
    { email: 'account3@gmail.com', password: 'pass3' },
],

schedule: {
    enabled: true,
    minutes: [20, 40, 55],  // Not used in mapping mode
    
    accountMapping: {
        enabled: true,
        mapping: [20, 40, 55],  // Acc1 at :20, Acc2 at :40, Acc3 at :55
    },
},
```

**Behavior:**
- **11:20** → Account 1
- **11:40** → Account 2
- **11:55** → Account 3
- **12:20** → Account 1
- **12:40** → Account 2
- **12:55** → Account 3

---

## 🔧 How It Works

1. **If `accountMapping.enabled = false`:**
   - The system uses the normal `minutes` array
   - ALL accounts run at EACH scheduled minute
   - Example: [29, 59] means all accounts run at :29 AND :59

2. **If `accountMapping.enabled = true`:**
   - The system uses the `mapping` array
   - Each account runs ONLY at its assigned minute
   - `mapping[0]` = minute for `accounts[0]`
   - `mapping[1]` = minute for `accounts[1]`
   - etc.

---

## ✅ Benefits

1. **Reduced Detection Risk** - Spreads out account activity
2. **Better Resource Management** - One account at a time
3. **Easier Debugging** - Clear separation of account runs
4. **Flexible Scheduling** - Custom timing per account

---

## 🚀 Quick Setup

To enable account mapping for 2 accounts:

1. Open `src/config/loop-config.ts`
2. Set `accountMapping.enabled: true`
3. Set `accountMapping.mapping: [29, 59]`
4. Make sure you have 2 accounts in the `accounts` array
5. Run: `npm run loop`

That's it! Account 1 will run at :29, Account 2 will run at :59.

---

## 📝 Notes

- The `minutes` array is ignored when `accountMapping` is enabled
- Make sure `mapping.length` matches `accounts.length`
- If an account has no mapping, it will be skipped
- The system automatically waits until the next scheduled time for each account

---

**Happy automating! 🎯**
