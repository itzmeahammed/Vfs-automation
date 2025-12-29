/**
 * AWS Elastic IP Rotator
 * 
 * Rotates the public IP of the current EC2 instance by:
 * 1. Allocating a new Elastic IP
 * 2. Associating it with the current instance
 * 3. Releasing the old Elastic IP (if applicable)
 * 
 * Requirements:
 * - AWS CLI installed and configured (or IAM Role attached)
 * - Permissions: ec2:AllocateAddress, ec2:AssociateAddress, ec2:ReleaseAddress, ec2:DescribeAddresses
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { sendStatusUpdate } from './telegram.js';

const execAsync = promisify(exec);

export async function rotateAWSPublicIP(): Promise<boolean> {
    console.log('\n🔄 Initiating AWS IP Rotation...');

    try {
        // 0. Get Current (Old) IP
        console.log('   🆔 Fetching current Public IP...');
        const { stdout: oldIpRaw } = await execAsync('curl -s http://checkip.amazonaws.com');
        const oldIp = oldIpRaw.trim();
        console.log(`   📍 Old IP: ${oldIp}`);

        // 1. Get Instance ID (from metadata service)
        console.log('   🆔 Fetching Instance ID...');
        const { stdout: instanceId } = await execAsync('curl -s http://169.254.169.254/latest/meta-data/instance-id');

        if (!instanceId || instanceId.includes('HTML')) {
            throw new Error('Could not get Instance ID. Are we running on AWS EC2?');
        }
        console.log(`   ✅ Instance ID: ${instanceId}`);

        // 2. Allocate New Elastic IP
        console.log('   🆕 Allocating new Elastic IP...');
        const { stdout: allocOut } = await execAsync('aws ec2 allocate-address --domain vpc');
        const allocData = JSON.parse(allocOut);
        const newAllocationId = allocData.AllocationId;
        const newPublicIp = allocData.PublicIp;
        console.log(`   ✅ Allocated IP: ${newPublicIp} (${newAllocationId})`);

        // 3. Associate New IP
        console.log('   🔗 Associating new IP to instance...');
        await execAsync(`aws ec2 associate-address --instance-id ${instanceId} --allocation-id ${newAllocationId}`);
        console.log('   ✅ IP Associated successfully');

        // 4. Find Old/Unused Elastic IPs to Release (Cleanup)
        // We list all addresses, find those NOT associated, and release them
        console.log('   🧹 Cleaning up old IPs...');
        const { stdout: descOut } = await execAsync('aws ec2 describe-addresses');
        const addresses = JSON.parse(descOut).Addresses;

        for (const addr of addresses) {
            // If address is not associated (AssociationId is missing) OR matches our new one (skip)
            if (addr.AllocationId !== newAllocationId && !addr.AssociationId) {
                console.log(`   🗑️ Releasing old IP: ${addr.PublicIp}`);
                await execAsync(`aws ec2 release-address --allocation-id ${addr.AllocationId}`);
            }
        }

        console.log(`✅ IP Rotation Complete! New IP: ${newPublicIp}`);

        // Notify Telegram
        await sendStatusUpdate(`🔄 **AWS IP Rotated!**\n\n🔴 Old IP: \`${oldIp}\`\n🟢 New IP: \`${newPublicIp}\``);

        return true;

    } catch (error: any) {
        console.error('❌ AWS IP Rotation Failed:', error.message);
        console.log('   👉 Ensure AWS CLI is installed and IAM Role validation is correct.');
        return false;
    }
}
