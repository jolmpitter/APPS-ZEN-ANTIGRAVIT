import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MetaAdsAPI } from '@/lib/meta-ads';
import { PDFGenerator } from '@/lib/pdf-generator';
import { EmailSender } from '@/lib/email-sender';
import { v4 as uuidv4 } from 'uuid';

// POST: Gerar relatório sob demanda
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Verificar permissão
    if (user.role !== 'gerente' && user.role !== 'gestor') {
      return NextResponse.json(
        { error: 'Você não tem permissão para gerar relatórios' },
        { status: 403 }
      );
    }

    const {
      accountId,
      period = 'last_30d',
      sendEmail = false,
      recipients,
      includeMetrics = true,
      includeFunnel = true,
      includeTimeSeries = true,
      createPublicLink = false,
      linkExpiresInDays,
    } = await req.json();

    // Validar
    if (!accountId) {
      return NextResponse.json(
        { error: 'ID da conta é obrigatório' },
        { status: 400 }
      );
    }

    if (sendEmail && (!recipients || recipients.length === 0)) {
      return NextResponse.json(
        { error: 'Destinatários são obrigatórios para envio de email' },
        { status: 400 }
      );
    }

    // Buscar conta
    const account = await prisma.facebookAdAccount.findUnique({
      where: { id: accountId }
    });

    if (!account || account.userId !== user.id) {
      return NextResponse.json(
        { error: 'Conta não encontrada' },
        { status: 404 }
      );
    }

    // Buscar dados do Meta Ads
    const metaApi = new MetaAdsAPI(account.accessToken, account.accountId);

    // Buscar métricas
    const metrics = await metaApi.getAccountInsights(period);

    // Buscar dados temporais se necessário
    let timeSeriesData = null;
    if (includeTimeSeries) {
      const timeSeries = await metaApi.getTimeSeriesInsights();
      timeSeriesData = timeSeries.daily_data;
    }

    // Gerar PDF
    const pdfGenerator = new PDFGenerator();
    const pdfBuffer = pdfGenerator.generateReport({
      accountName: account.accountName,
      period,
      metrics,
      timeSeriesData: timeSeriesData || [],
      includeMetrics,
      includeFunnel,
      includeTimeSeries,
    });

    let publicLink = null;

    // Criar link público se solicitado
    if (createPublicLink) {
      const token = uuidv4();
      const expiresAt = linkExpiresInDays
        ? new Date(Date.now() + linkExpiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const reportLink = await prisma.reportLink.create({
        data: {
          userId: user.id,
          token,
          reportData: JSON.stringify({
            accountName: account.accountName,
            period,
            metrics,
            timeSeriesData,
            includeMetrics,
            includeFunnel,
            includeTimeSeries,
          }),
          expiresAt,
        }
      });

      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      publicLink = `${baseUrl}/reports/view/${token}`;
    }

    // Enviar email se solicitado
    if (sendEmail && recipients && recipients.length > 0) {
      const emailSender = new EmailSender();
      const success = await emailSender.sendMetaAdsReport({
        recipients,
        accountName: account.accountName,
        period,
        pdfBuffer,
        reportLink: publicLink || undefined,
      });

      if (!success) {
        return NextResponse.json(
          { error: 'Erro ao enviar email. Verifique as configurações SMTP.' },
          { status: 500 }
        );
      }
    }

    // Retornar PDF como base64 para download
    const pdfBase64 = pdfBuffer.toString('base64');

    return NextResponse.json({
      message: 'Relatório gerado com sucesso',
      pdfBase64,
      publicLink,
      emailSent: sendEmail,
    });
  } catch (error: any) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar relatório', details: error.message },
      { status: 500 }
    );
  }
}
