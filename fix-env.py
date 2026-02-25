import os
with open('.env', 'rb') as f:
    content = f.read()

# Decode handling both utf-16 le and standard uft-8
try:
    text = content.decode('utf-16le')
except UnicodeDecodeError:
    text = content.decode('utf-8')

# Remove the bad spaced out strings
lines = text.split('\n')
clean_lines = []
for line in lines:
    if 'R E S E N D' not in line:
        clean_lines.append(line.replace('\x00', '').strip())

# Clean up empty lines at the end
while clean_lines and not clean_lines[-1]:
    clean_lines.pop()

# Add the good lines back
clean_lines.append('RESEND_API_KEY="re_AwB8M2Xt_9Zd9tjhHwXJqcM9P1XJgicZE"')
clean_lines.append('RESEND_FROM_EMAIL="noreply@stocksx.info"')

with open('.env', 'w', encoding='utf-8') as f:
    f.write('\n'.join(clean_lines) + '\n')
