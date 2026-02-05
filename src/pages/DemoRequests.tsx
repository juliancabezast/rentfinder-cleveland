 import React, { useState, useEffect } from 'react';
 import { UserPlus, Search, ChevronDown, ChevronUp, Mail, Phone, Building2, MessageSquare, Calendar } from 'lucide-react';
 import { Skeleton } from '@/components/ui/skeleton';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import { Card, CardContent, CardHeader } from '@/components/ui/card';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from '@/components/ui/table';
 import { Badge } from '@/components/ui/badge';
 import { supabase } from '@/integrations/supabase/client';
 import { format } from 'date-fns';
 import { toast } from 'sonner';
 import { cn } from '@/lib/utils';
 
 interface DemoRequest {
   id: string;
   full_name: string;
   email: string;
   phone: string;
   company_name: string | null;
   portfolio_size: string | null;
   message: string | null;
   status: string;
   notes: string | null;
   created_at: string | null;
   updated_at: string | null;
 }
 
 const STATUS_OPTIONS = [
   { value: 'new', label: 'New', color: 'bg-blue-500' },
   { value: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
   { value: 'demo_scheduled', label: 'Demo Scheduled', color: 'bg-purple-500' },
   { value: 'converted', label: 'Converted', color: 'bg-green-500' },
   { value: 'lost', label: 'Lost', color: 'bg-gray-500' },
 ];
 
 const getStatusBadge = (status: string) => {
   const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
   return (
     <Badge variant="outline" className="gap-1.5">
       <span className={cn('h-2 w-2 rounded-full', statusConfig.color)} />
       {statusConfig.label}
     </Badge>
   );
 };
 
 const DemoRequests: React.FC = () => {
   const [requests, setRequests] = useState<DemoRequest[]>([]);
   const [loading, setLoading] = useState(true);
   const [searchQuery, setSearchQuery] = useState('');
   const [statusFilter, setStatusFilter] = useState<string>('all');
   const [expandedId, setExpandedId] = useState<string | null>(null);
   const [editingNotes, setEditingNotes] = useState<string | null>(null);
   const [notesValue, setNotesValue] = useState('');
   const [saving, setSaving] = useState(false);
 
   const fetchRequests = async () => {
     setLoading(true);
     try {
       let query = supabase
         .from('demo_requests')
         .select('*')
         .order('created_at', { ascending: false });
 
       if (statusFilter !== 'all') {
         query = query.eq('status', statusFilter);
       }
 
       const { data, error } = await query;
 
       if (error) throw error;
       setRequests(data || []);
     } catch (error) {
       console.error('Error fetching demo requests:', error);
       toast.error('Failed to load demo requests');
     } finally {
       setLoading(false);
     }
   };
 
   useEffect(() => {
     fetchRequests();
   }, [statusFilter]);
 
   const handleStatusChange = async (id: string, newStatus: string) => {
     try {
       const { error } = await supabase
         .from('demo_requests')
         .update({ status: newStatus, updated_at: new Date().toISOString() })
         .eq('id', id);
 
       if (error) throw error;
 
       setRequests(prev => prev.map(r => 
         r.id === id ? { ...r, status: newStatus, updated_at: new Date().toISOString() } : r
       ));
       toast.success('Status updated');
     } catch (error) {
       console.error('Error updating status:', error);
       toast.error('Failed to update status');
     }
   };
 
   const handleSaveNotes = async (id: string) => {
     setSaving(true);
     try {
       const { error } = await supabase
         .from('demo_requests')
         .update({ notes: notesValue, updated_at: new Date().toISOString() })
         .eq('id', id);
 
       if (error) throw error;
 
       setRequests(prev => prev.map(r => 
         r.id === id ? { ...r, notes: notesValue, updated_at: new Date().toISOString() } : r
       ));
       setEditingNotes(null);
       toast.success('Notes saved');
     } catch (error) {
       console.error('Error saving notes:', error);
       toast.error('Failed to save notes');
     } finally {
       setSaving(false);
     }
   };
 
   const toggleExpand = (id: string) => {
     if (expandedId === id) {
       setExpandedId(null);
       setEditingNotes(null);
     } else {
       setExpandedId(id);
       const request = requests.find(r => r.id === id);
       setNotesValue(request?.notes || '');
     }
   };
 
   const filteredRequests = requests.filter((request) => {
     const searchLower = searchQuery.toLowerCase();
     return (
       request.full_name.toLowerCase().includes(searchLower) ||
       request.email.toLowerCase().includes(searchLower) ||
       request.phone.includes(searchLower) ||
       (request.company_name?.toLowerCase().includes(searchLower) ?? false)
     );
   });
 
   return (
     <div className="space-y-6">
       <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
         <div>
           <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
             <UserPlus className="h-6 w-6" />
             Demo Requests
           </h1>
           <p className="text-muted-foreground">
             Manage incoming demo requests from the landing page
           </p>
         </div>
         <div className="flex items-center gap-2">
           <Badge variant="secondary" className="text-sm">
             {requests.filter(r => r.status === 'new').length} new
           </Badge>
         </div>
       </div>
 
       <Card variant="glass">
         <CardHeader>
           <div className="flex flex-col sm:flex-row gap-4">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
               <Input
                 placeholder="Search by name, email, phone, or company..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="pl-9"
               />
             </div>
             <Select value={statusFilter} onValueChange={setStatusFilter}>
               <SelectTrigger className="w-full sm:w-48">
                 <SelectValue placeholder="Filter by status" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All Statuses</SelectItem>
                 {STATUS_OPTIONS.map(status => (
                   <SelectItem key={status.value} value={status.value}>
                     <div className="flex items-center gap-2">
                       <span className={cn('h-2 w-2 rounded-full', status.color)} />
                       {status.label}
                     </div>
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
         </CardHeader>
         <CardContent>
           {loading ? (
             <div className="space-y-4">
               {Array.from({ length: 5 }).map((_, i) => (
                 <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                   <Skeleton className="h-4 w-32" />
                   <Skeleton className="h-4 w-48" />
                   <Skeleton className="h-4 w-28" />
                   <Skeleton className="h-6 w-24" />
                   <Skeleton className="h-4 w-20" />
                 </div>
               ))}
             </div>
           ) : filteredRequests.length === 0 ? (
             <div className="text-center py-12">
               <div className="rounded-full bg-muted p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                 <UserPlus className="h-8 w-8 text-muted-foreground" />
               </div>
               <h3 className="text-lg font-medium mb-1">
                 {searchQuery || statusFilter !== 'all'
                   ? 'No requests found'
                   : 'No demo requests yet'}
               </h3>
               <p className="text-sm text-muted-foreground">
                 {searchQuery || statusFilter !== 'all'
                   ? 'Try adjusting your search or filter criteria'
                   : 'Demo requests from the landing page will appear here.'}
               </p>
             </div>
           ) : (
             <div className="rounded-lg border overflow-hidden">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead className="w-[30px]"></TableHead>
                     <TableHead>Name</TableHead>
                     <TableHead>Email</TableHead>
                     <TableHead>Phone</TableHead>
                     <TableHead>Company</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Date</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {filteredRequests.map((request) => (
                     <React.Fragment key={request.id}>
                       <TableRow 
                         className="cursor-pointer hover:bg-muted/50"
                         onClick={() => toggleExpand(request.id)}
                       >
                         <TableCell>
                           {expandedId === request.id ? (
                             <ChevronUp className="h-4 w-4 text-muted-foreground" />
                           ) : (
                             <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           )}
                         </TableCell>
                         <TableCell className="font-medium">{request.full_name}</TableCell>
                         <TableCell>{request.email}</TableCell>
                         <TableCell>{request.phone}</TableCell>
                         <TableCell>{request.company_name || '—'}</TableCell>
                         <TableCell onClick={(e) => e.stopPropagation()}>
                           <Select
                             value={request.status}
                             onValueChange={(value) => handleStatusChange(request.id, value)}
                           >
                             <SelectTrigger className="w-[150px] h-8">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               {STATUS_OPTIONS.map(status => (
                                 <SelectItem key={status.value} value={status.value}>
                                   <div className="flex items-center gap-2">
                                     <span className={cn('h-2 w-2 rounded-full', status.color)} />
                                     {status.label}
                                   </div>
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         </TableCell>
                         <TableCell className="text-muted-foreground">
                           {request.created_at
                             ? format(new Date(request.created_at), 'MMM d, yyyy')
                             : '—'}
                         </TableCell>
                       </TableRow>
                       {expandedId === request.id && (
                         <TableRow>
                           <TableCell colSpan={7} className="bg-muted/30 p-0">
                             <div className="p-6 space-y-4">
                               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                 <div className="flex items-center gap-2 text-sm">
                                   <Mail className="h-4 w-4 text-muted-foreground" />
                                   <a href={`mailto:${request.email}`} className="text-primary hover:underline">
                                     {request.email}
                                   </a>
                                 </div>
                                 <div className="flex items-center gap-2 text-sm">
                                   <Phone className="h-4 w-4 text-muted-foreground" />
                                   <a href={`tel:${request.phone}`} className="text-primary hover:underline">
                                     {request.phone}
                                   </a>
                                 </div>
                                 {request.company_name && (
                                   <div className="flex items-center gap-2 text-sm">
                                     <Building2 className="h-4 w-4 text-muted-foreground" />
                                     <span>{request.company_name}</span>
                                   </div>
                                 )}
                                 {request.portfolio_size && (
                                   <div className="flex items-center gap-2 text-sm">
                                     <span className="text-muted-foreground">Portfolio:</span>
                                     <span>{request.portfolio_size}</span>
                                   </div>
                                 )}
                               </div>
 
                               {request.message && (
                                 <div className="space-y-2">
                                   <div className="flex items-center gap-2 text-sm font-medium">
                                     <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                     Message
                                   </div>
                                   <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                                     {request.message}
                                   </p>
                                 </div>
                               )}
 
                               <div className="space-y-2">
                                 <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-2 text-sm font-medium">
                                     <Calendar className="h-4 w-4 text-muted-foreground" />
                                     Internal Notes
                                   </div>
                                   {editingNotes !== request.id && (
                                     <Button 
                                       variant="outline" 
                                       size="sm"
                                       onClick={() => {
                                         setEditingNotes(request.id);
                                         setNotesValue(request.notes || '');
                                       }}
                                     >
                                       {request.notes ? 'Edit Notes' : 'Add Notes'}
                                     </Button>
                                   )}
                                 </div>
                                 {editingNotes === request.id ? (
                                   <div className="space-y-2">
                                     <Textarea
                                       value={notesValue}
                                       onChange={(e) => setNotesValue(e.target.value)}
                                       placeholder="Add internal notes about this request..."
                                       rows={3}
                                     />
                                     <div className="flex gap-2">
                                       <Button 
                                         size="sm" 
                                         onClick={() => handleSaveNotes(request.id)}
                                         disabled={saving}
                                       >
                                         {saving ? 'Saving...' : 'Save Notes'}
                                       </Button>
                                       <Button 
                                         variant="outline" 
                                         size="sm"
                                         onClick={() => setEditingNotes(null)}
                                       >
                                         Cancel
                                       </Button>
                                     </div>
                                   </div>
                                 ) : request.notes ? (
                                   <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                                     {request.notes}
                                   </p>
                                 ) : (
                                   <p className="text-sm text-muted-foreground italic">
                                     No notes yet.
                                   </p>
                                 )}
                               </div>
 
                               <div className="text-xs text-muted-foreground pt-2 border-t">
                                 Created: {request.created_at ? format(new Date(request.created_at), 'PPpp') : '—'}
                                 {request.updated_at && request.updated_at !== request.created_at && (
                                   <span className="ml-4">
                                     Last updated: {format(new Date(request.updated_at), 'PPpp')}
                                   </span>
                                 )}
                               </div>
                             </div>
                           </TableCell>
                         </TableRow>
                       )}
                     </React.Fragment>
                   ))}
                 </TableBody>
               </Table>
             </div>
           )}
         </CardContent>
       </Card>
     </div>
   );
 };
 
 export default DemoRequests;